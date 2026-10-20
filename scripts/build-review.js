"use strict";
const fs = require("node:fs");
const path = require("node:path");
const core = require("./review-core.js");
const root = path.resolve(__dirname, "..");

function browserRender() {
  "use strict";
  const host = document.getElementById("review");
  const el = (tag, text, cls, parent = host) => {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  };
  let data;
  try { data = JSON.parse(document.getElementById("review-data").textContent); }
  catch (e) { el("h1", "[ERR-OUT-03] 审查数据无法解析 / Invalid review data"); el("p", "未展示分数或准入结论。请检查 JSON 数据格式。", "error"); return; }
  const r = ReviewCore.compute(data);
  const en = data && data.lang === "en";
  const t = (zh, eng) => en ? eng : zh;
  const status = s => en ? ({ "已明确":"Clear", "基本明确":"Mostly clear", "部分明确":"Partly clear", "未明确":"Unclear", "不适用":"Not applicable", "待确认":"Pending", "部分确认":"Partly confirmed", "已确认":"Confirmed", "未写入":"Not written", "正文已生成":"Draft generated", "已写入":"Written", "未验证":"Not tested", "已验证":"Tested" }[s] || s) : s;
  const verdict = v => en ? ({ "可提交评审":"Ready to submit for review", "建议补充后提交":"Supplement before submitting", "暂不建议提交":"Not ready to submit", "可以进入开发":"Ready for development", "补充确认后可以开发":"Confirm details before development", "暂不建议直接开发":"Not ready for development", "具备初步可测条件":"Ready for initial test planning", "补充确认后可测":"Confirm details before test planning", "暂不具备初步可测条件":"Not ready for initial test planning", "当前材料可支持用例设计":"Materials support test design", "补充确认后可支持":"Confirm details to support test design", "需要先完成关键口径对齐":"Align key rules first", "材料适用范围待确认，暂不判断":"Confirm scope before judging readiness", "材料未能读取，暂不判断":"Unreadable materials: no readiness decision" }[v] || v) : v;
  if (!r.ok) {
    el("h1", t("[ERR-OUT-03] 请先补齐审查数据", "[ERR-OUT-03] Correct the review data first"));
    el("p", t("已停止评分和准入判断，未显示正常报告。请修正以下字段后重新生成。", "No score or readiness verdict is shown. Correct these fields and regenerate."), "error");
    const list = el("ul"); r.errors.forEach(x => el("li", x, "", list)); return;
  }
  const header = el("header", null, "panel");
  el("p", data.kind === "fast" ? t("一级快筛 · 8 项标准", "Level 1 · 8 checks") : t("二级深审 · 12 个维度", "Level 2 · 12 dimensions"), "eyebrow", header);
  el("h1", data.title, "", header);
  el("p", data.reportId + " · r" + data.revision + " · " + data.date + " · " + data.materialVersion, "muted", header);
  el("h2", verdict(r.verdict), "verdict " + r.level, header);
  el("p", t("下一步：", "Next: ") + (en ? (r.level === "unknown" ? "Provide readable materials and confirm the applicable scope." : r.open.length ? "Reply by item ID; business confirms outcomes and engineering confirms implementation. Recheck only affected dimensions." : "Proceed according to the stated review goal. Functional testing is still required.") : r.nextStep), "next", header);
  if (en && data.kind === "fast" && data.lane === "product" && r.count.P0 && r.level === "warn") el("p", "If P0 items cannot close before review, change the verdict to not ready to submit.", "", header);
  if (!r.readable) {
    el("p", t("[ERR-MAT-01] 材料均未能读取。已停止评分、图表和事项结论展示。请提供可读取材料后重新审查。", "[ERR-MAT-01] No materials could be read. Scoring, charts and findings are withheld. Provide readable materials and review again."), "error", header);
    data.materials.forEach(m => el("p", m.name + " ｜ " + m.source + " ｜ " + m.state, "", header));
    host.dataset.valid="true"; host.dataset.level="unknown"; return;
  }
  if (en && data.kind === "fast" && r.count.P0) el("p", "P0 items affect outcomes or readiness. A deeper review may help check related impacts; it is optional and never started automatically.", "", header);
  if (data.kind === "deep" && data.summary) el("p", t("整体判断：", "Overall assessment: ") + data.summary, "", header);
  const chips = el("div", null, "chips", header);
  ReviewCore.PRIORITY.filter(p => data.kind === "deep" || p !== "P3").forEach(p => el("span", p + " " + r.count[p], "chip", chips));
  el("span", t("待确认 ", "Pending ") + r.open.length + t(" 项", ""), "chip", chips);
  el("span", t("已确认 ", "Confirmed ") + r.closed.length + t(" 项", ""), "chip", chips);
  el("p", t("本页反映当前材料的明确程度，不是产品质量分，也不是功能测试通过率。业务确认、文件写入与功能验证分别记录。", "This reflects material clarity, not product quality or a test pass rate. Confirmation, document writing and testing are tracked separately."), "muted", header);
  const action = el("section", null, "panel");
  el("h2", t("先处理这些待确认事项", "Resolve these items first"), "", action);
  el("p", t("优先级与结论按全部待确认事项计算，首屏显示上限不影响判断。", "Counts and verdicts use all open items, not just the items visible first."), "muted", action);
  function finding(f, parent) {
    const card = el("article", null, "finding", parent);
    el("h3", f.id + " · " + f.priority + " · " + f.title, "", card);
    el("p", t("谁来确认：", "Owner: ") + f.owner + " ｜ " + status(f.confirmation), "", card);
    for (const key of ["business", "technical"]) {
      const b = f[key]; if (!b.required) continue;
      el("p", (key === "business" ? t("产品确认业务结果：", "Business outcome: ") : t("研发确认实现方案：", "Engineering implementation: ")) + b.question, "", card);
      if (b.answer) el("p", t("已收到：", "Confirmed answer: ") + b.answer + t("；依据：", "; source: ") + b.source, "answer", card);
    }
    el("p", t("补到哪里：", "Document location: ") + f.location, "", card);
    el("p", t("关联检查项：", "Affected checks: ") + f.affected.join("、"), "muted", card);
    el("p", t("建议补充：", "Suggested change: ") + f.advice, "", card);
    el("p", t("文档：", "Document: ") + status(f.document.status) + " ｜ " + t("功能：", "Function: ") + status(f.verification.status), "muted", card);
    const details = el("details", null, "", card);
    el("summary", t("查看依据与给研发的备注", "Evidence and technical notes"), "", details);
    [[t("原文依据", "Evidence"),f.evidence],[t("材料现状", "Material facts"),f.fact],[t("影响", "Impact"),f.testImpact],[t("类型", "Type"),f.type],[t("文档操作依据", "Document evidence"),f.document.evidence],[t("验证依据", "Test evidence"),f.verification.evidence],[t("给研发的备注", "Technical notes"),f.technicalNotes]].forEach(([k,v]) => { if(v) el("p", k + "：" + v, "", details); });
  }
  r.shown.forEach(f => finding(f,action));
  if (!r.open.length) el("p", r.level === "unknown" ? t("材料范围未确认，不能据此认定没有缺口。", "Scope is unconfirmed; this does not mean no gaps exist.") : t("当前材料未发现待确认缺口。", "No open gaps found in current materials."), "", action);
  if (r.remaining.length) {
    const more = el("details", null, "", action);
    el("summary", t("展开其余 ", "Show remaining ") + r.remaining.length + t(" 项（仍计入判断）", " items (included in verdict)"), "", more);
    r.remaining.forEach(f => finding(f,more));
  }
  if (r.closed.length) {
    const closed = el("details", null, "panel");
    el("summary", t("已确认事项与依据 ", "Confirmed items and evidence ") + r.closed.length, "", closed);
    r.closed.forEach(f => finding(f,closed));
  }
  const overview = el("section", null, "panel");
  el("h2", data.kind === "fast" ? t("8 项标准明细", "8-check detail") : t("12 维材料明确程度", "Clarity across 12 dimensions"), "", overview);
  el("p", data.kind === "fast" ? t("已明确 / 适用项：", "Clear / applicable: ") + r.rate : t("综合可测性指数：", "Clarity index: ") + (r.score === null ? "—" : r.score) + t("；不适用项不计入，结论按未取整均值及待确认优先级判断。", "; N/A excluded; verdict uses the unrounded mean and open priorities."), "metric", overview);
  if (data.kind === "deep" && r.applicable) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS,"svg");
    svg.setAttribute("viewBox","0 0 760 550"); svg.setAttribute("role","img"); svg.setAttribute("aria-label",t("12维材料明确程度雷达图", "12-dimension material clarity radar"));
    overview.appendChild(svg);
    const add = (tag,attrs,txt) => { const n = document.createElementNS(NS,tag); Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v))); if(txt!==undefined)n.textContent=txt; svg.appendChild(n); return n; };
    const pt = (i,radius) => { const a=i*2*Math.PI/12-Math.PI/2; return [380+Math.cos(a)*radius,265+Math.sin(a)*radius]; };
    [100,80,60,40,20].forEach(v => add("polygon",{points:r.checks.map((_,i)=>pt(i,165*v/100).join(",")).join(" "),fill:"none",stroke:"#ddd","stroke-width":1}));
    r.checks.forEach((c,i)=> { const [x,y]=pt(i,165); add("line",{x1:380,y1:265,x2:x,y2:y,stroke:c.value===null?"#aaa":"#ddd"}); });
    const used = r.checks.map((c,i)=>({c,i})).filter(x=>x.c.value!==null);
    const color = {pass:"#0F6E56",warn:"#854F0B",fail:"#A32D2D",unknown:"#5F5E5A"}[r.level];
    if (used.length===12) add("polygon",{points:used.map(x=>pt(x.i,165*x.c.value/100).join(",")).join(" "),fill:color,"fill-opacity":0.09,stroke:color,"stroke-width":2});
    used.forEach(x=> {
      const [cx,cy]=pt(x.i,165*x.c.value/100); add("circle",{cx,cy,r:4,fill:color});
      const next=r.checks[(x.i+1)%12];
      if(used.length<12&&next.value!==null){const [nx,ny]=pt((x.i+1)%12,165*next.value/100);add("line",{x1:cx,y1:cy,x2:nx,y2:ny,stroke:color,"stroke-width":2});}
    });
    el("p",t("不适用轴不补零，不跨缺口填面积；这里只连接相邻的适用点。", "N/A axes are not zero; no area bridges missing dimensions. Only adjacent applicable points are connected."),"muted",overview);
    r.checks.forEach((c,i)=> { const [x,y]=pt(i,202); const cos=Math.cos(i*2*Math.PI/12-Math.PI/2); add("text",{x,y:y+4,"text-anchor":cos>0.25?"start":cos< -0.25?"end":"middle","font-size":12,fill:c.value===null?"#777":"#333"},(c.short||c.label||c.name)+(c.value===null?t("（不适用）"," (N/A)"):"")); });
  }
  const grid=el("div",null,"grid",overview);
  r.checks.forEach(c=> {
    const box=el("article",null,"check",grid);
    el("h3",c.id+" · "+(c.label||c.name),"",box);
    const cls={"已明确":"pass","基本明确":"warn","部分明确":"warn","未明确":"fail","不适用":"unknown"}[c.status];
    el("span",status(c.status)+(data.kind==="deep"?" · "+(c.value===null?"—":c.value):""),"badge "+cls,box);
    el("p",t("依据：","Evidence: ")+c.evidence,"muted",box);
    if(c.advice)el("p",c.advice,"",box);
  });
  if (data.kind === "deep") {
    const evidence=el("section",null,"panel");
    el("h2",t("建议补充的验收证据", "Acceptance evidence to add"),"",evidence);
    (data.acceptanceEvidence || []).forEach(x=>el("p",x,"",evidence));
    if (!data.acceptanceEvidence?.length) el("p",t("按各建议条目的影响补充证据；未提供证据不等于已验证。", "Add evidence according to item impacts; absent evidence is not a test result."),"",evidence);
  }
  const materials=el("details",null,"panel"); el("summary",t("材料来源、读取状态与本轮变更","Materials, read status and changes"),"",materials);
  data.materials.forEach(m=>el("p",m.name+" ｜ "+m.source+" ｜ "+m.version+" ｜ "+m.state+" ｜ "+m.role,"",materials));
  (data.changes||[]).forEach(c=>el("p",c,"",materials));
  el("footer",t("确认答案不会自动改文件。需要补文档时可先生成可粘贴正文；明确授权编辑后优先保存修订副本。", "Answers do not automatically edit files. Request suggested text first, or explicitly authorize a revised copy."),"muted");
  host.dataset.valid="true"; host.dataset.level=r.level;
}
function renderHTML(data) {
  const result=core.compute(data);
  if(!result.ok)throw new Error(result.errors.join("\n"));
  const engine=fs.readFileSync(path.join(__dirname,"review-core.js"),"utf8");
  return `<!DOCTYPE html>\n<html lang="${data.lang==="en"?"en":"zh-CN"}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><link rel="icon" href="data:,"><title>Requirement review · v2.4.0</title><style>
*{box-sizing:border-box}body{margin:0;padding:28px 20px;background:#fafaf8;color:#2c2c2a;font-family:system-ui,"Microsoft YaHei",sans-serif;font-size:14px;line-height:1.65}main{max-width:1000px;margin:auto}.panel{background:white;border:1px solid #e3e2dc;border-radius:12px;padding:22px;margin-bottom:16px}h1{font-size:25px;line-height:1.4;margin:8px 0}h2{font-size:18px;margin:10px 0}h3{font-size:15px;margin:6px 0}p{margin:8px 0;overflow-wrap:anywhere}.eyebrow,.muted{font-size:12px;color:#60605b}.verdict{padding:12px 16px;border-radius:8px}.pass{background:#e1f5ee;color:#0f6e56}.warn{background:#faeeda;color:#854f0b}.fail,.error{background:#fcebee;color:#a32d2d}.unknown{background:#f1efe8;color:#5f5e5a}.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.chip{border:1px solid #ddd;border-radius:18px;padding:2px 10px;font-size:12px}.finding{border-top:1px solid #eee;padding:16px 0}.answer{color:#0f6e56}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}.check{border:1px solid #e3e2dc;border-radius:8px;padding:14px}.badge{display:inline-block;padding:2px 8px;border-radius:5px;font-size:12px}summary{cursor:pointer;font-weight:500}details p{font-size:13px}svg{display:block;width:100%;max-width:760px;margin:0 auto}.metric{font-size:14px}footer{padding:0 8px}@media print{body{background:white;padding:0}.panel{break-inside:auto}.finding,.check{break-inside:avoid}details>*{display:block!important}summary{display:block}.grid{grid-template-columns:1fr 1fr}}@media(max-width:500px){body{padding:12px}.panel{padding:16px}h1{font-size:22px}}
</style></head><body><main id="review"></main><noscript>需要启用 JavaScript 查看本地报告 / Enable JavaScript to view this offline report.</noscript>
<script type="application/json" id="review-data">${core.safeJSON(data)}</script>
<script>\n${engine}\n(${browserRender.toString()})();\n</script></body></html>\n`;
}
const escapeMD=v=>String(v??"—").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\|/g,"&#124;").replace(/\r?\n/g," ");
function renderMarkdown(data) {
  const r=core.compute(data); if(!r.ok)throw new Error(r.errors.join("\n"));
  const en=data.lang==="en", t=(zh,eng)=>en?eng:zh, e=escapeMD;
  const lines=["# "+e(data.title),"","> "+e(data.reportId)+" | r"+data.revision+" | "+e(data.date)+" | "+e(data.materialVersion),"> "+t("结论：","Verdict (canonical): ")+r.verdict,"> "+t("指标只反映材料明确程度，不代表产品质量或功能通过率。","Metrics describe material clarity, not product quality or a functional pass rate."),""];
  if (!r.readable) {
    lines.push(t("[ERR-MAT-01] 所有材料均未能读取。已停止评分、维度与事项结论展示。请提供可读取材料后重新审查。", "[ERR-MAT-01] No readable materials. Scores and findings are withheld. Provide readable materials and review again."), "", ...data.materials.map(m=>"- "+[m.name,m.source,m.state].map(e).join(" | ")));
    return lines.join("\n");
  }
  const priorities=core.PRIORITY.filter(p=>data.kind==="deep"||p!=="P3").map(p=>p+" "+r.count[p]).join(" / ");
  const materialLines=()=> { lines.push("| "+t("材料 | 来源 | 版本 | 读取状态 | 作用","Material | Source | Version | Read status | Role")+" |","|---|---|---|---|---|");data.materials.forEach(m=>lines.push("| "+[m.name,m.source,m.version,m.state,m.role].map(e).join(" | ")+" |")); lines.push(""); };
  const issue=(f)=> {
    lines.push("### "+e(f.id)+"｜"+e(f.title),"","- "+t("优先级：","Priority: ")+f.priority,"- "+t("建议类型：","Type: ")+e(f.type),"- "+t("依据位置：","Evidence: ")+e(f.evidence),"- "+t("当前材料表现：","Material facts: ")+e(f.fact),"- "+t("建议调整：","Suggested change: ")+e(f.advice),"- "+t("对测试工作的影响：","Test impact: ")+e(f.testImpact),"- "+t("待确认对象：","Owner: ")+e(f.owner),"- "+t("确认状态：","Confirmation (canonical): ")+f.confirmation,"- "+t("建议补充位置：","Document location: ")+e(f.location));
    lines.push("- "+t("关联检查项：", "Affected checks: ")+f.affected.join("、"));
    for(const key of ["business","technical"]){const b=f[key];if(!b.required)continue;lines.push("- "+(key==="business"?t("产品确认业务结果：","Business outcome: "):t("研发确认实现方案：","Engineering implementation: "))+e(b.question));if(b.answer)lines.push("  - "+t("已确认答案：","Answer: ")+e(b.answer)+t("；来源：","; source: ")+e(b.source));}
    lines.push("- "+t("文档状态：","Document status (canonical): ")+f.document.status+(f.document.evidence?" — "+e(f.document.evidence):""),"- "+t("功能状态：","Test status (canonical): ")+f.verification.status+(f.verification.evidence?" — "+e(f.verification.evidence):""));
    if(f.technicalNotes)lines.push("- "+t("给研发的备注：","Technical notes: ")+e(f.technicalNotes));lines.push("");
  };
  const checks=()=>{lines.push("| # | "+t("维度 | 状态 | 分值/依据 | 建议明确","Dimension | Status | Score / evidence | Suggested clarification")+" |","|---|---|---|---|---|");r.checks.forEach(c=>lines.push("| "+[c.id,c.label||c.name,c.status,(data.kind==="deep"?(c.value===null?"—":c.value)+" / ":"")+c.evidence,c.advice||"—"].map(e).join(" | ")+" |"));lines.push("");};
  if(data.kind==="fast"){
    lines.push("## "+t("一、材料与读取状态","1. Materials"),"");materialLines();
    lines.push("## "+t("二、快速结论与下一步","2. Verdict and next steps"),"",r.verdict,"",priorities+" | "+t("已明确 / 适用项：","Clear / applicable: ")+r.rate,"",e(r.nextStep),"");
    lines.push("## "+t("三、8 项最小标准","3. Eight checks"),"");checks();
    lines.push("## "+t("四、待确认事项与确认记录","4. Open items and confirmation records"),"");
  }else{
    lines.push("## "+t("一、审查概览","1. Review overview"),"",r.verdict,"",priorities+" | "+t("综合指数：","Clarity index: ")+(r.score===null?"—":r.score)+" | "+t("计入维度：","Applicable dimensions: ")+r.applicable,"",e(r.nextStep),"");
    lines.push("## "+t("二、整体判断","2. Overall assessment"),"",e(data.summary||r.nextStep),"");
    lines.push("## "+t("三、建议调整清单","3. Suggested changes"),"");
  }
  if(!r.findings.length)lines.push(r.level==="unknown"?t("材料适用范围或读取状态待确认，暂不作无缺口判断。","Scope or readability is unconfirmed; no gap-free claim is made."):t("当前材料未发现关键缺口。","No key gaps found in current materials."),"");
  [...r.open,...r.closed].forEach(issue);
  if(data.kind==="deep"){lines.push("## "+t("四、按审查维度汇总","4. Dimension summary"),"");checks();lines.push("## "+t("五、待确认事项","5. Pending confirmations"),"");r.open.forEach(f=>lines.push("- [ ] "+e(f.id)+" "+e(f.title)+" — "+e(f.owner)));lines.push("","## "+t("六、建议补充的验收证据","6. Acceptance evidence to add"),"");(data.acceptanceEvidence||[]).forEach(x=>lines.push("- "+e(x)));if(!data.acceptanceEvidence?.length)lines.push(t("按各建议条目的影响补充证据；未提供证据不等于已验证。","Add evidence according to item impacts; absent evidence is not a test result."));lines.push("","## "+t("七、测试准备提示","7. Test preparation"),"",e(r.nextStep),"",t("补文档不等于功能验证。未确认的规则不能当作最终测试预期。","Document updates are not functional tests. Unconfirmed rules cannot be final expected results."),"","## "+t("八、材料与证据索引","8. Materials and evidence"),"");materialLines();}
  else{lines.push("## "+t("五、下一步与本轮变更","5. Next steps and changes"),"",e(r.nextStep),"",t("补文档按需触发；明确授权编辑后优先修订副本。","Document edits are optional and require explicit authorization; prefer a revised copy."),"",...((data.changes||[]).map(x=>"- "+e(x))),"","## "+t("六、待确认问题清单（可直接转发）","6. Questions to forward"),"");r.open.forEach(f=>{for(const key of ["business","technical"]){const b=f[key];if(b.required&&!b.answer)lines.push(e(f.id)+" "+(key==="business"?t("产品：","Business: "):t("研发：","Engineering: "))+e(b.question));}});}
  lines.push("",t("说明：所有待确认事项均计入优先级和结论；HTML 首屏仅展示前 ","All open items count towards the verdict; HTML initially shows ")+r.top+t(" 项，其余可展开。"," items; the rest can be expanded."),"");
  if(data.kind==="deep" && data.changes?.length) lines.push(t("本轮变更：", "Changes in this revision:"),...data.changes.map(x=>"- "+e(x)),"");
  // Safe, machine-readable continuation state without adding a visible report section.
  lines.push("<!-- review-data-v2\n"+core.safeJSON(data).replace(/-/g,"\\u002d")+"\n-->","");
  return lines.join("\n");
}
function demo(kind) {
  const names=kind==="fast"?core.FAST:core.DEEP;
  const data={schemaVersion:2,kind,lane:kind==="fast"?"product":"test",lang:"zh",title:kind==="fast"?"需求快筛｜会议室预约（虚构示例）":"需求可测性审查｜会议室预约（虚构示例）",date:"2026-10-19",reportId:"DEMO-"+kind.toUpperCase(),revision:1,materialVersion:"虚构需求 v1",top:3,materials:[{name:"会议室预约需求（完全虚构）",source:"内置示例文本",version:"v1",state:"已读全文",role:"主需求"}],checks:names.map((name,i)=>({id:i+1,name,short:kind==="deep"?["目标范围","术语口径","权限前置","主流程","边界精度","异常恢复","状态一致","数据接口","兼容要求","交互视觉","依赖发布","验收证据"][i]:name,status:"已明确",evidence:"虚构需求第 "+(i+1)+" 节",advice:""})),findings:[],changes:["初次审查；没有编辑需求文件，也没有执行功能测试。"]};
  const make=(n,priority,affected,title,question)=>({id:kind==="fast"?"Q"+n:"建议 "+String(n).padStart(3,"0"),priority,impact:"fill_rule",title,type:"业务规则",owner:"产品、研发",location:"虚构需求“异常处理”章节",evidence:"虚构需求只描述预约成功，未覆盖本事项",fact:"没有说明“"+title+"”的结果",advice:"补充已确认的业务结果；研发实现另行确认，不预设答案。",testImpact:"目前无法确定该场景应该显示什么、产生几条记录。",affected,business:{required:true,question,answer:"",source:""},technical:{required:n===1,question:n===1?"按业务确认的结果，如何防止同一预约被重复处理？":"",answer:"",source:""},document:{status:"未写入",evidence:""},verification:{status:"未验证",evidence:""}});
  if(kind==="fast"){
    data.checks[2].status="部分明确"; data.checks[3].status="未明确"; data.checks[4].status="未明确"; data.checks[5].status="部分明确";
    data.findings=[make(1,"P0",[3,5,6],"重复提交后的预约结果","连续点击两次“预约”，应生成几条预约记录，第二次显示什么？"),make(2,"P1",[4],"不同身份可预约的范围","访客与员工分别可以预约哪些会议室？")];
  }else{
    const states=["已明确","基本明确","未明确","基本明确","部分明确","未明确","部分明确","基本明确","不适用","已明确","部分明确","基本明确"];
    data.checks.forEach((c,i)=>{c.status=states[i];if(c.status==="不适用")c.evidence="本示例只检查规则文本，非功能要求不在此演示范围；真实项目须按实际范围判断。";});
    data.findings=[make(1,"P0",[3,6],"重复提交与权限结果","不同身份重复点击“预约”时，应允许哪些操作、保留几条记录？"),make(2,"P1",[5,7,11],"预约边界与生效时机","预约时段边界如何计算，修改后何时生效，依赖何时可用？"),make(3,"P2",[2,4,8,12],"文案与验收示例","已确定的业务规则是否可以补上统一术语和可对照的示例？")];
    data.acceptanceEvidence=["正常主流程：成功预约后的页面和记录示例（待提供）","边界与时间：起止时刻的预期结果（待确认）","异常与恢复：重复点击后的结果（待确认）","权限与数据隔离：不同身份的可见范围（待确认）","页面状态：处理中、成功、失败的显示（待提供）","后台记录：用于核对预约数量的证据（待提供）"];
  }
  return data;
}
function writeNew(dest,content){fs.writeFileSync(dest,content,{encoding:"utf8",flag:"wx"});}
function outputPlan(data,base,format=data.format||"md+html") {
  if(!["md+html","md","html"].includes(format))throw new Error("format 必须为 md+html/md/html");
  const entries=[];
  if(format!=="md")entries.push({path:base+".html",content:renderHTML(data)});
  if(format!=="html")entries.push({path:base+".md",content:renderMarkdown(data)});
  return entries;
}
function main(){
  const args=process.argv.slice(2);
  if(args[0]==="--templates"){
    for(const kind of ["fast","deep"]){const file=path.join(root,"templates",kind==="fast"?"fast-screen-card.html":"deep-review-radar.html");fs.writeFileSync(file,renderHTML(demo(kind)),"utf8");console.log("TEMPLATE",file);}
  }else if(args[0]==="--demo"&&args[1]){
    const out=path.resolve(args[1]);if(!fs.statSync(out).isDirectory())throw new Error("输出目录不存在");
    for(const kind of ["fast","deep"]){const data=demo(kind), base=path.join(out,"v2.4.0-"+kind+"-demo");writeNew(base+".html",renderHTML(data));writeNew(base+".md",renderMarkdown(data));writeNew(base+".json",core.safeJSON(data));console.log("DEMO",base);}
  }else if(args.length>=2 && !args[0].startsWith("--")){
    const data=JSON.parse(fs.readFileSync(path.resolve(args[0]),"utf8"));const base=path.resolve(args[1]);
    const options=args.slice(2);let format;
    if(options.length===0)format=data.format||"md+html";
    else if(options.length===1&&options[0]==="--no-html")format="md";
    else if(options.length===1&&/^(?:--)?format=/.test(options[0]))format=options[0].split("=")[1];
    else if(options.length===2&&options[0]==="--format")format=options[1];
    else throw new Error("未识别的生成参数；支持 --format md+html|md|html 或 --no-html");
    const entries=outputPlan(data,base,format);
    if(entries.some(x=>fs.existsSync(x.path)))throw new Error("输出已存在，请使用新的修订号文件名");
    entries.forEach(x=>writeNew(x.path,x.content));console.log(JSON.stringify(core.compute(data),null,2));
  }else{console.log("Usage: node build-review.js data.json output-basename [--format md+html|md|html | --no-html] | --demo existing-dir | --templates");process.exitCode=1;}
}
module.exports={renderHTML,renderMarkdown,demo,outputPlan};
if(require.main===module)main();
