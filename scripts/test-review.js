"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const core=require("./review-core.js");
const build=require("./build-review.js");
let passed=0;
function test(name,fn){try{fn();passed++;console.log("PASS",name);}catch(e){console.error("FAIL",name,e.stack);process.exitCode=1;}}
const clone=x=>JSON.parse(JSON.stringify(x));
function valid(data){const r=core.compute(data);assert.equal(r.ok,true,JSON.stringify(r.errors));return r;}
function invalid(data,needle){const r=core.compute(data);assert.equal(r.ok,false);if(needle)assert.ok(r.errors.some(x=>x.includes(needle)),r.errors.join("\n"));}
function close(f){for(const key of ["business","technical"]){if(f[key].required){f[key].answer="明确确认的演示答案";f[key].source="虚构责任人确认记录";}}}
function complete(kind){const d=build.demo(kind);d.findings=[];d.checks.forEach(c=>c.status="已明确");return d;}
const empty={P0:0,P1:0,P2:0,P3:0};

test("fast demo 4/8 and product fill_rule",()=>{const r=valid(build.demo("fast"));assert.equal(r.rate,"4/8");assert.equal(r.count.P0,1);assert.equal(r.verdict,"建议补充后提交");});
test("deep demo mean 665/11 and rounded 60",()=>{const r=valid(build.demo("deep"));assert.equal(r.average,665/11);assert.equal(r.score,60);assert.equal(r.applicable,11);assert.equal(r.verdict,"需要先完成关键口径对齐");});
for(const lane of ["product","dev","test"]){
  test(lane+" clear pass",()=>{const d=complete("fast");d.lane=lane;assert.equal(valid(d).level,"pass");});
  test(lane+" P1 warning",()=>{const d=build.demo("fast");d.lane=lane;d.findings[0].priority="P1";assert.equal(valid(d).level,"warn");});
}
test("P0 blocks dev and test",()=>{for(const lane of ["dev","test"]){const d=build.demo("fast");d.lane=lane;assert.equal(valid(d).level,"fail");}});
test("product rework and cannot_close fail",()=>{for(const impact of ["rework","cannot_close"]){const d=build.demo("fast");d.findings[0].impact=impact;assert.equal(valid(d).verdict,"暂不建议提交");}});
test("missing product P0 impact rejected",()=>{const d=build.demo("fast");delete d.findings[0].impact;invalid(d,"impact");});
test("only P2 preserves pass",()=>{const d=build.demo("fast");d.findings.forEach(f=>f.priority="P2");assert.equal(valid(d).level,"pass");});
test("deep clear pass",()=>assert.equal(valid(complete("deep")).verdict,"当前材料可支持用例设计"));
test("high mean cannot hide P1",()=>{const d=complete("deep");const f=build.demo("deep").findings[1];f.affected=[1];d.findings=[f];d.checks[0].status="部分明确";const r=valid(d);assert.ok(r.average>85);assert.equal(r.level,"warn");});
test("high mean cannot hide P0",()=>{const d=complete("deep");const f=build.demo("deep").findings[0];f.affected=[1];d.findings=[f];d.checks[0].status="未明确";const r=valid(d);assert.ok(r.average>85);assert.equal(r.level,"fail");});
test("unrounded 69.5 below70 and 70 at threshold",()=>{assert.equal(core.classify("deep","test",empty,69.5,12,[]).level,"fail");assert.equal(core.classify("deep","test",empty,70,12,[]).level,"warn");});
test("unrounded 84.5 below85 and 85 at threshold",()=>{assert.equal(core.classify("deep","test",empty,84.5,12,[]).level,"warn");assert.equal(core.classify("deep","test",empty,85,12,[]).level,"pass");});
test("all N/A gives no score or pass",()=>{for(const kind of ["fast","deep"]){const d=complete(kind);d.checks.forEach(c=>c.status="不适用");const r=valid(d);assert.equal(r.score,null);assert.equal(r.rate,"—");assert.equal(r.level,"unknown");}});
test("all unreadable gives no score or readiness decision",()=>{for(const kind of ["fast","deep"]){const d=complete(kind);d.materials[0].state="读取失败";const r=valid(d);assert.equal(r.level,"unknown");assert.equal(r.score,null);assert.equal(r.rate,"—");}});
test("partial business answer does not close technical",()=>{const d=build.demo("fast");d.findings[0].business.answer="只生成一条";d.findings[0].business.source="虚构产品确认";const r=valid(d);assert.equal(r.findings[0].confirmation,"部分确认");assert.equal(r.count.P0,1);assert.equal(r.rate,"4/8");});
test("full answer without recheck rejected",()=>{const d=build.demo("fast");close(d.findings[0]);invalid(d,"没有待确认依据");});
test("answer with recheck closes only affected items",()=>{const d=build.demo("fast");close(d.findings[0]);d.findings[0].affected.forEach(id=>d.checks[id-1].status="已明确");const r=valid(d);assert.equal(r.count.P0,0);assert.equal(r.count.P1,1);assert.equal(r.closed.length,1);assert.equal(r.rate,"7/8");assert.equal(r.closed[0].document.status,"未写入");assert.equal(r.closed[0].verification.status,"未验证");});
test("answer without source rejected",()=>{const d=build.demo("fast");d.findings[0].business.answer="一条";invalid(d,"答案与确认来源");});
test("technical not required cannot carry answer",()=>{const d=build.demo("fast");d.findings[1].technical.answer="方案";d.findings[1].technical.source="记录";invalid(d,"非必需确认");});
test("at least one required branch",()=>{const d=build.demo("fast");d.findings[0].business.required=false;d.findings[0].technical.required=false;invalid(d,"至少需要");});
test("written requires evidence",()=>{const d=build.demo("fast");d.findings[0].document.status="已写入";invalid(d,"对应依据");});
test("verified requires execution evidence",()=>{const d=build.demo("fast");d.findings[0].verification.status="已验证";invalid(d,"执行证据");});
test("draft generated distinct from written",()=>{const d=build.demo("fast");d.findings[0].business.answer="一条预约";d.findings[0].business.source="虚构产品确认";d.findings[0].document={status:"正文已生成",evidence:"本轮可粘贴段落"};const r=valid(d);assert.equal(r.findings[0].confirmation,"部分确认");assert.equal(r.findings[0].document.status,"正文已生成");assert.equal(r.findings[0].verification.status,"未验证");});
test("cannot generate or write unconfirmed facts",()=>{for(const status of ["正文已生成","已写入"]){const d=build.demo("fast");d.findings[0].document={status,evidence:"模拟文档依据"};invalid(d,"已确认分支");}});
test("top does not change counts or verdict",()=>{const d=build.demo("fast"),a=valid(d);d.top=1;const b=valid(d);assert.deepEqual(a.count,b.count);assert.equal(a.verdict,b.verdict);assert.equal(b.shown.length,1);assert.equal(b.remaining.length,1);});
test("more than five P0 retained and counted",()=>{const d=build.demo("fast");d.top=8;const f=d.findings[0];d.findings=Array.from({length:7},(_,i)=>({...clone(f),id:"Q"+(i+1)}));d.findings.push({...clone(build.demo("fast").findings[1]),id:"Q8"});const r=valid(d);assert.equal(r.count.P0,7);assert.equal(r.shown.filter(f=>f.priority==="P0").length,5);assert.equal(r.remaining.length,2);});
for(const [name,mut,needle] of [
  ["invalid status",d=>d.checks[0].status="成功","状态非法"],
  ["wrong dimension count",d=>d.checks.pop(),"恰好"],
  ["wrong dimension name",d=>d.checks[0].name="随便","名称不匹配"],
  ["duplicate ID",d=>d.findings[1].id=d.findings[0].id,"编号重复"],
  ["invalid affected index",d=>d.findings[0].affected=[0],"affected"],
  ["duplicate affected index",d=>d.findings[0].affected=[3,3],"affected"],
  ["old score rejected",d=>d.score=99,"禁止手填"],
  ["old verdict rejected",d=>d.verdict="通过","禁止手填"],
  ["closed flag rejected",d=>d.findings[0].closed=true,"不允许手填"],
  ["top out of range",d=>d.top=99,"top"],
  ["missing evidence",d=>d.checks[0].evidence="","缺少依据"],
  ["clear but open rejected",d=>d.checks[2].status="已明确","不能标已明确"],
  ["N/A but open rejected",d=>d.checks[2].status="不适用","不适用维度"],
  ["null nested status rejected",d=>d.findings[0].document={status:null},"文档状态非法"],
  ["numeric document rejected",d=>d.findings[0].document=3,"文档状态非法"],
  ["null document rejected",d=>d.findings[0].document=null,"文档状态非法"],
  ["invalid date rejected",d=>d.date="2026-02-30","date"],
  ["wrong changes type",d=>d.changes=3,"changes"],
  ["wrong schema version",d=>d.schemaVersion=1,"schemaVersion"],
  ["missing readable materials",d=>d.materials=[],"materials"]
])test(name,()=>{const d=build.demo("fast");mut(d);invalid(d,needle);});
test("deep P0 inconsistent dimension rejected",()=>{const d=build.demo("deep");d.checks[2].status="部分明确";invalid(d,"P0 关联维度");});
test("deep P1 cannot label mostly clear",()=>{const d=build.demo("deep");d.checks[4].status="基本明确";invalid(d,"P1 关联维度");});
test("non-object input rejected",()=>{for(const v of [null,[],"abc",3])invalid(v);});
test("malformed structures do not crash",()=>{for(const key of ["checks","findings","materials"]){for(const value of [null,{},[null],[3]]){const d=build.demo("fast");d[key]=value;invalid(d);}}});
test("all text attack sequences round trip safely",()=>{const d=build.demo("fast");const payload='</script><script>globalThis.pwned=1</script><img src=x onerror=alert(1)> & " \' \u2028 \u2029';d.title=payload;d.findings[0].advice=payload;const serialized=core.safeJSON(d);assert.ok(!serialized.includes("<"));assert.deepEqual(JSON.parse(serialized),d);const html=build.renderHTML(d);assert.equal((html.match(/<script/g)||[]).length,2);assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('innerHTML'));});
test("markdown text cannot inject HTML or split table",()=>{const d=build.demo("fast");d.title='<img src=x onerror=alert(1)>';d.checks[0].evidence='a | b\n<img>';const md=build.renderMarkdown(d);assert.ok(!md.includes('<img'));assert.ok(md.includes('&#124;'));});
test("both reports share score count and verdict",()=>{for(const kind of ["fast","deep"]){const d=build.demo(kind),r=valid(d),html=build.renderHTML(d),md=build.renderMarkdown(d);const embedded=JSON.parse(html.match(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/)[1]);assert.deepEqual(embedded,d);assert.ok(md.includes(r.verdict));assert.ok(md.includes(kind==="fast"?r.rate:String(r.score)));assert.ok(md.includes("P0 "+r.count.P0));}});
test("english template supports labels without changing canonical names",()=>{const d=build.demo("fast");d.lang="en";d.title="Room booking demo";d.checks[0].label="Scope";const html=build.renderHTML(d),md=build.renderMarkdown(d);assert.ok(html.includes('<html lang="en">'));assert.ok(md.includes("Scope"));valid(d);});

class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.ownText="";}
  set textContent(t){this.ownText=String(t);this.children=[];}
  get textContent(){return this.ownText+this.children.map(c=>c.textContent).join("\n");}
  appendChild(c){this.children.push(c);return c;}
  setAttribute(k,v){this.attributes[k]=String(v);}
}
function renderVM(data,override){
  const html=build.renderHTML(data),host=new Node("main"),block=new Node("script");block.textContent=override===undefined?core.safeJSON(data):override;
  const document={getElementById:id=>id==="review"?host:block,createElement:t=>new Node(t),createElementNS:(_,t)=>new Node(t)};
  const context={document,console};vm.createContext(context);const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);vm.runInContext(scripts[0][1],context);return {host,context,html};
}
test("offline scripts render fast and deep in DOM stub",()=>{for(const kind of ["fast","deep"]){const {host}=renderVM(build.demo(kind));assert.equal(host.dataset.valid,"true");assert.ok(host.textContent.includes(valid(build.demo(kind)).verdict));}});
test("untrusted text remains text in rendered DOM",()=>{const d=build.demo("deep");d.title='</script><script>globalThis.pwned=1</script>';d.checks[0].short='<img src=x>';const {host,context}=renderVM(d);assert.equal(context.pwned,undefined);assert.ok(host.textContent.includes(d.title));assert.ok(host.textContent.includes('<img src=x>'));});
test("generated templates contain identical canonical engine",()=>{for(const file of ["fast-screen-card.html","deep-review-radar.html"]){const html=fs.readFileSync(path.join(__dirname,"..","templates",file),"utf8");assert.ok(html.includes(fs.readFileSync(path.join(__dirname,"review-core.js"),"utf8")));assert.ok(!/<(?:script|link)[^>]+(?:src|href)\s*=\s*["'](?:https?:)?\/\//.test(html));const d=JSON.parse(html.match(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/)[1]);valid(d);}});
test("null JSON shows error instead of blank screen",()=>{const {host}=renderVM(build.demo("fast"),"null");assert.ok(host.textContent.includes("ERR-OUT-03"));assert.notEqual(host.dataset.valid,"true");});
test("unreadable materials withhold dimension scores charts and findings",()=>{const d=build.demo("deep");d.materials[0].state="读取失败";const r=valid(d);assert.ok(r.checks.every(c=>c.value===null));const {host}=renderVM(d);assert.ok(host.textContent.includes("ERR-MAT-01"));assert.ok(!host.textContent.includes("先处理这些"));assert.ok(!build.renderMarkdown(d).includes("100 /"));d.lang="en";assert.ok(renderVM(d).host.textContent.includes("Provide readable materials"));});
test("markdown continuation state survives safe comment embedding",()=>{const d=build.demo("fast");d.title+=' --><script>globalThis.pwned=1</script>';const md=build.renderMarkdown(d);const m=md.match(/<!-- review-data-v2\n([\s\S]*?)\n-->/);assert.ok(m);assert.deepEqual(JSON.parse(m[1]),d);assert.ok(!m[1].includes("--"));assert.ok(md.includes("关联检查项：3、5、6"));});
test("single-format output plan returns exactly requested artifacts",()=>{const d=build.demo("fast");assert.deepEqual(build.outputPlan(d,"sample","md").map(x=>x.path),["sample.md"]);assert.deepEqual(build.outputPlan(d,"sample","html").map(x=>x.path),["sample.html"]);assert.equal(build.outputPlan(d,"sample").length,2);assert.throws(()=>build.outputPlan(d,"sample","pdf"));});
test("deep formats retain assessment evidence and revision changes",()=>{const d=build.demo("deep");d.summary="SUMMARY_SENTINEL";d.acceptanceEvidence=["EVIDENCE_SENTINEL"];d.changes=["CHANGE_SENTINEL"];const md=build.renderMarkdown(d).split("<!-- review-data-v2")[0],body=renderVM(d).host.textContent;for(const v of [d.summary,...d.acceptanceEvidence,...d.changes]){assert.ok(md.includes(v));assert.ok(body.includes(v));}});
test("next-step IDs match the visible capped set",()=>{const d=build.demo("fast");d.top=8;const f=d.findings[0];d.findings=Array.from({length:7},(_,i)=>({...clone(f),id:"Q"+(i+1)}));d.findings.push({...clone(build.demo("fast").findings[1]),id:"Q8"});const r=valid(d);assert.ok(r.nextStep.includes("Q1、Q2、Q3、Q4、Q5、Q8"));assert.ok(!r.nextStep.includes("Q6"));});
test("P0 suggests optional deep review without automatically starting it",()=>{assert.ok(valid(build.demo("fast")).nextStep.includes("不自动展开深审"));});
console.log(JSON.stringify({passed,failed:process.exitCode?true:false,note:"DOM stub tests are not a substitute for a real browser or colleague trial."}));
