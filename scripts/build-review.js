"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");
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
  const reportError = (code, message, next, issues = [], en = false) => {
    host.dataset.valid = "false";
    el("h1", "[" + code + "] " + (en ? "What happened: " : "发生什么：") + message);
    el("p", en ? "Handled: Scoring and readiness decisions stopped. No automatic repair or retry; the browser has not written any files or partial files." : "已做处理：停止评分和准入判断；未自动修复、未重试；浏览器未写入文件，无部分文件。", "error");
    el("p", (en ? "Next: " : "建议下一步：") + next);
    const list = el("ul");
    issues.forEach(x => el("li", typeof x === "string" ? x : (x.path || "DATA") + "：" + (x.message || "字段不符合契约"), "", list));
  };
  let data, r;
  try { data = JSON.parse(document.getElementById("review-data").textContent); }
  catch (_) { reportError("ERR-OUT-03", "审查数据无法解析 / Invalid review data", "由执行者核对嵌入数据与生成步骤；用户仅补充业务事实，无需手写 JSON。"); return; }
  try { r = ReviewCore.compute(data); }
  catch (_) { reportError("ERR-INT-01", "审查引擎未能完成计算", "由执行者核对引擎与模板版本；用户仅补充业务事实，无需手写 JSON。"); return; }
  const en = data && data.lang === "en";
  const t = (zh, eng) => en ? eng : zh;
  const status = s => en ? ({ "已明确":"Clear", "基本明确":"Mostly clear", "部分明确":"Partly clear", "未明确":"Unclear", "不适用":"Not applicable", "待确认":"Pending", "部分确认":"Partly confirmed", "已确认":"Confirmed", "未写入":"Not written", "正文已生成":"Draft generated", "已写入":"Written", "未验证":"Not tested", "已验证":"Tested" }[s] || s) : s;
  const verdict = v => en ? ({ "可提交评审":"Ready to submit for review", "建议补充后提交":"Supplement before submitting", "暂不建议提交":"Not ready to submit", "可以进入开发":"Ready for development", "补充确认后可以开发":"Confirm details before development", "暂不建议直接开发":"Not ready for development", "具备初步可测条件":"Ready for initial test planning", "补充确认后可测":"Confirm details before test planning", "暂不具备初步可测条件":"Not ready for initial test planning", "当前材料可支持用例设计":"Materials support test design", "补充确认后可支持":"Confirm details to support test design", "需要先完成关键口径对齐":"Align key rules first", "材料适用范围待确认，暂不判断":"Confirm scope before judging readiness", "材料未能读取，暂不判断":"Unreadable materials: no readiness decision" }[v] || v) : v;
  if (!r.ok) {
    reportError("ERR-OUT-03", t("审查数据不符合契约", "Review data does not meet the contract"), t("由执行者核对以下字段；用户仅补充业务事实，无需手写 JSON。", "The operator must check the fields below; users only supply business facts, not handwritten JSON."), r.issues || r.errors || [], en);
    return;
  }
  const header = el("header", null, "panel");
  el("p", data.kind === "fast" ? t("一级快筛 · 8 项标准", "Level 1 · 8 checks") : t("二级深审 · 12 个维度", "Level 2 · 12 dimensions"), "eyebrow", header);
  el("h1", data.title, "", header);
  el("p", data.reportId + " · r" + data.revision + " · " + data.date + " · " + data.materialVersion, "muted", header);
  if (r.limited) {
    el("p", t("[WARN-MAT-01] 仅基于已读范围的局部审查，不代表整份需求已通过。", "[WARN-MAT-01] Partial review of readable scope only; this is not approval of the complete requirement."), "error", header);
    data.materials.filter(m => m.state !== "已读全文").forEach(m => el("p", m.name + " ｜ " + m.state + " ｜ " + m.coverage, "", header));
  }
  el("h2", (r.limited ? t("已读范围结论：", "Read-scope verdict: ") : "") + verdict(r.verdict), "verdict " + r.level, header);
  el("p", t("下一步：", "Next: ") + (en ? (r.level === "unknown" ? "Provide readable materials and confirm the applicable scope." : r.open.length ? "Reply by item ID; business confirms outcomes and engineering confirms implementation. Recheck only affected dimensions." : "Proceed according to the stated review goal. Functional testing is still required.") : r.nextStep), "next", header);
  if (en && data.kind === "fast" && data.lane === "product" && r.count.P0 && r.level === "warn") el("p", "If P0 items cannot close before review, change the verdict to not ready to submit.", "", header);
  if (!r.readable) {
    el("p", t("[ERR-MAT-01] 发生什么：材料均未能读取。", "[ERR-MAT-01] What happened: No materials could be read."), "error", header);
    el("p", t("已做处理：停止评分、图表和事项结论展示；未自动修复、未重试；浏览器未写入文件，无部分文件。", "Handled: Scores, charts and findings are withheld. No automatic repair or retry; the browser has written no files or partial files."), "", header);
    el("p", t("建议下一步：请提供可读取材料及业务事实，由执行者核对读取状态；用户无需手写 JSON。", "Next: Provide readable materials and business facts; the operator checks read status. Users need not write JSON."), "", header);
    data.materials.forEach(m => el("p", m.name + " ｜ " + m.source + " ｜ " + m.state + " ｜ " + (m.coverage || ""), "", header));
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
      if (b.answer && b.answer.trim()) el("p", t("已收到：", "Confirmed answer: ") + b.answer + t("；依据：", "; source: ") + b.source, "answer", card);
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
  data.materials.forEach(m=>el("p",m.name+" ｜ "+m.source+" ｜ "+m.version+" ｜ "+m.state+" ｜ "+m.role+(m.coverage?" ｜ "+m.coverage:""),"",materials));
  (data.changes||[]).forEach(c=>el("p",c,"",materials));
  el("footer",t("确认答案不会自动改文件。需要补文档时可先生成可粘贴正文；明确授权编辑后优先保存修订副本。", "Answers do not automatically edit files. Request suggested text first, or explicitly authorize a revised copy."),"muted");
  host.dataset.valid="true"; host.dataset.level=r.level;
}
function renderHTML(data) {
  validateData(data);
  const engine=fs.readFileSync(path.join(__dirname,"review-core.js"),"utf8");
  return `<!DOCTYPE html>\n<html lang="${data.lang==="en"?"en":"zh-CN"}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><link rel="icon" href="data:,"><title>Requirement review · v2.4.1</title><style>
*{box-sizing:border-box}body{margin:0;padding:28px 20px;background:#fafaf8;color:#2c2c2a;font-family:system-ui,"Microsoft YaHei",sans-serif;font-size:14px;line-height:1.65}main{max-width:1000px;margin:auto}.panel{background:white;border:1px solid #e3e2dc;border-radius:12px;padding:22px;margin-bottom:16px}h1{font-size:25px;line-height:1.4;margin:8px 0}h2{font-size:18px;margin:10px 0}h3{font-size:15px;margin:6px 0}p{margin:8px 0;overflow-wrap:anywhere}.eyebrow,.muted{font-size:12px;color:#60605b}.verdict{padding:12px 16px;border-radius:8px}.pass{background:#e1f5ee;color:#0f6e56}.warn{background:#faeeda;color:#854f0b}.fail,.error{background:#fcebee;color:#a32d2d}.unknown{background:#f1efe8;color:#5f5e5a}.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.chip{border:1px solid #ddd;border-radius:18px;padding:2px 10px;font-size:12px}.finding{border-top:1px solid #eee;padding:16px 0}.answer{color:#0f6e56}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}.check{border:1px solid #e3e2dc;border-radius:8px;padding:14px}.badge{display:inline-block;padding:2px 8px;border-radius:5px;font-size:12px}summary{cursor:pointer;font-weight:500}details p{font-size:13px}svg{display:block;width:100%;max-width:760px;margin:0 auto}.metric{font-size:14px}footer{padding:0 8px}@media print{body{background:white;padding:0}.panel{break-inside:auto}.finding,.check{break-inside:avoid}details>*{display:block!important}summary{display:block}.grid{grid-template-columns:1fr 1fr}}@media(max-width:500px){body{padding:12px}.panel{padding:16px}h1{font-size:22px}}
</style></head><body><main id="review"></main><noscript>需要启用 JavaScript 查看本地报告 / Enable JavaScript to view this offline report.</noscript>
<script type="application/json" id="review-data">${core.safeJSON(data)}</script>
<script>\n${engine}\n(${browserRender.toString()})();\n</script></body></html>\n`;
}
const escapeMD=v=>String(v??"—").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\|/g,"&#124;").replace(/\r?\n/g," ");
function renderMarkdown(data) {
  const r=validateData(data);
  const en=data.lang==="en", t=(zh,eng)=>en?eng:zh, e=escapeMD;
  const lines=["# "+e(data.title),"","> "+e(data.reportId)+" | r"+data.revision+" | "+e(data.date)+" | "+e(data.materialVersion),"> "+t("结论：","Verdict (canonical): ")+r.verdict,"> "+t("指标只反映材料明确程度，不代表产品质量或功能通过率。","Metrics describe material clarity, not product quality or a functional pass rate."),""];
  if (r.limited) lines.splice(4, 0, "> [WARN-MAT-01] " + t("仅基于已读范围的局部审查，不代表整份需求已通过；未读范围须补齐后另行审查。", "Partial review of readable scope only; not approval of the complete requirement. Unread scope needs a separate review."));
  if (!r.readable) {
    lines.push(t("[ERR-MAT-01] 发生什么：所有材料均未能读取。", "[ERR-MAT-01] What happened: No materials could be read."), "", t("已做处理：停止评分、维度和事项结论展示；未自动修复、未重试。本文件只记录读取失败，不是正常审查结果；文件写入状态以生成命令的实际清单为准。", "Handled: Scores, dimensions and findings are withheld; no automatic repair or retry. This document records unreadable materials, not a normal review. Actual write status comes from the command result."), "", t("建议下一步：提供可读取材料及业务事实，确认后另行审查；无需用户手写 JSON。", "Next: Provide readable materials and business facts for a separately authorized review; users need not write JSON."), "", ...data.materials.map(m=>"- "+[m.name,m.source,m.state,m.coverage].map(e).join(" | ")));
    lines.push("", "<!-- review-data-v2\n" + core.safeJSON(data).replace(/-/g,"\\u002d") + "\n-->", "");
    return lines.join("\n");
  }
  const priorities=core.PRIORITY.filter(p=>data.kind==="deep"||p!=="P3").map(p=>p+" "+r.count[p]).join(" / ");
  const materialLines=()=> { lines.push("| "+t("材料 | 来源 | 版本 | 读取状态 | 作用 | 已读/未读范围","Material | Source | Version | Read status | Role | Coverage")+" |","|---|---|---|---|---|---|");data.materials.forEach(m=>lines.push("| "+[m.name,m.source,m.version,m.state,m.role,m.coverage||"—"].map(e).join(" | ")+" |")); lines.push(""); };
  const issue=(f)=> {
    lines.push("### "+e(f.id)+"｜"+e(f.title),"","- "+t("优先级：","Priority: ")+f.priority,"- "+t("建议类型：","Type: ")+e(f.type),"- "+t("依据位置：","Evidence: ")+e(f.evidence),"- "+t("当前材料表现：","Material facts: ")+e(f.fact),"- "+t("建议调整：","Suggested change: ")+e(f.advice),"- "+t("对测试工作的影响：","Test impact: ")+e(f.testImpact),"- "+t("待确认对象：","Owner: ")+e(f.owner),"- "+t("确认状态：","Confirmation (canonical): ")+f.confirmation,"- "+t("建议补充位置：","Document location: ")+e(f.location));
    lines.push("- "+t("关联检查项：", "Affected checks: ")+f.affected.join("、"));
    for(const key of ["business","technical"]){const b=f[key];if(!b.required)continue;lines.push("- "+(key==="business"?t("产品确认业务结果：","Business outcome: "):t("研发确认实现方案：","Engineering implementation: "))+e(b.question));if(b.answer && b.answer.trim())lines.push("  - "+t("已确认答案：","Answer: ")+e(b.answer)+t("；来源：","; source: ")+e(b.source));}
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
  else{lines.push("## "+t("五、下一步与本轮变更","5. Next steps and changes"),"",e(r.nextStep),"",t("补文档按需触发；明确授权编辑后优先修订副本。","Document edits are optional and require explicit authorization; prefer a revised copy."),"",...((data.changes||[]).map(x=>"- "+e(x))),"","## "+t("六、待确认问题清单（可直接转发）","6. Questions to forward"),"");r.open.forEach(f=>{for(const key of ["business","technical"]){const b=f[key];if(b.required&&!(b.answer && b.answer.trim()))lines.push(e(f.id)+" "+(key==="business"?t("产品：","Business: "):t("研发：","Engineering: "))+e(b.question));}});}
  lines.push("",t("说明：所有待确认事项均计入优先级和结论；HTML 首屏仅展示前 ","All open items count towards the verdict; HTML initially shows ")+r.top+t(" 项，其余可展开。"," items; the rest can be expanded."),"");
  if(data.kind==="deep" && data.changes?.length) lines.push(t("本轮变更：", "Changes in this revision:"),...data.changes.map(x=>"- "+e(x)),"");
  // 安全嵌入机器可读续审状态，不增加可见报告章节。
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
// 上限仅适用于统一审查 DATA JSON，不限制原始需求文档或其他原材料。
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const FORMATS = ["md+html", "md", "html"];
const NO_WRITE = "未自动修复、未重试；未写入任何输出，无部分文件；未修改输入文件。";
class ReviewError extends Error {
  constructor(code, exitCode, message, next, details = {}, handled = NO_WRITE) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.handled = handled;
    this.next = next;
    this.details = { completedFiles: [], incompleteFiles: [], unattemptedFiles: [], ...details };
  }
  toJSON() {
    return { ok: false, code: this.code, message: this.message, handled: this.handled, next: this.next, details: this.details };
  }
}
const systemCode = error => /^[A-Z][A-Z0-9_]{0,39}$/.test(error?.code || "") ? error.code : undefined;
function argumentError() {
  return new ReviewError("ERR-CLI-01", 2, "生成命令或参数不符合约定。", "执行 --help 查看用法；由执行者核对参数，不支持修复或重试选项。");
}
function validateData(data) {
  const result = core.compute(data);
  if (!result.ok) throw new ReviewError("ERR-OUT-03", 4, "审查 DATA 不符合契约，未生成报告。", "由执行者核对 messages 与 issues 指向的字段；用户仅补充业务事实，无需手写 JSON。", {
    messages: result.errors || [],
    issues: (result.issues || []).map(x => ({ path: x.path, message: x.message, code: x.code }))
  });
  return result;
}
function readInput(inputPath, io = fs) {
  const file = path.resolve(inputPath);
  const readError = error => new ReviewError("ERR-IN-01", 3, "无法读取审查 DATA JSON，输入必须是可读取的普通文件。", "由执行者核对输入路径、文件类型和读取权限；不改动原文件。", { path: file, systemCode: systemCode(error) });
  const checkSize = size => {
    if (size > MAX_INPUT_BYTES) throw new ReviewError("ERR-IN-02", 3, "统一审查 DATA JSON 超过 8 MiB 硬上限；这不是原始需求文档的容量限制。", "由执行者核对统一 DATA 的组织和大小；用户只需提供业务事实，不自动裁剪或拆分原材料。", { path: file, sizeBytes: size, maxInputBytes: MAX_INPUT_BYTES });
  };
  let info, bytes;
  try { info = io.statSync(file); } catch (error) { throw readError(error); }
  if (!info.isFile()) throw readError();
  checkSize(info.size);
  try { bytes = io.readFileSync(file); } catch (error) { throw readError(error); }
  checkSize(bytes.length);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new ReviewError("ERR-IN-04", 3, "审查 DATA JSON 带有 UTF-8 BOM，本生成器明确拒绝该编码标记。", "由执行者另存 UTF-8 无 BOM 的 DATA 副本；未自动移除 BOM，未修改源文件。", { path: file });
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (_) { throw new ReviewError("ERR-IN-03", 3, "审查 DATA JSON 不是有效 UTF-8，未替换或忽略非法字节。", "由执行者核对编码并另存有效 UTF-8 无 BOM 的 DATA 副本；用户无需手写 JSON。", { path: file }); }
  let data;
  try { data = JSON.parse(text); }
  catch (_) { throw new ReviewError("ERR-IN-05", 3, "审查 DATA JSON 语法无效，未回显原文片段。", "由执行者用 JSON 校验工具核对语法；用户仅补充业务事实，无需手写 JSON。", { path: file }); }
  return { data, path: file, sizeBytes: bytes.length };
}
function outputPlan(data, base, format = data?.format ?? "md+html") {
  validateData(data);
  if (!FORMATS.includes(format)) throw argumentError();
  // 只在独立副本中记录生效格式，不改源对象，也不掩盖原 DATA 的契约错误。
  const effective = structuredClone(data);
  effective.format = format;
  const entries = [];
  if (format !== "md") entries.push({ path: base + ".html", content: renderHTML(effective) });
  if (format !== "html") entries.push({ path: base + ".md", content: renderMarkdown(effective) });
  return entries;
}
const pathKey = file => process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);
function preflightOutputs(entries, io, inputPath, maintenance = false) {
  if (!Array.isArray(entries) || !entries.length || entries.some(x => !x || typeof x.path !== "string" || !x.path || typeof x.content !== "string")) {
    throw new ReviewError("ERR-INT-01", 6, "输出计划无效，停止生成。", "由执行者核对生成器调用与版本；用户仅补充业务事实。");
  }
  const planned = entries.map(x => ({ path: path.resolve(x.path), content: x.content }));
  const fail = (file, reason, error) => new ReviewError("ERR-OUT-01", 5, "输出预检未通过，未开始写入。", "由执行者核对目标路径、现有文件和父目录；普通生成不覆盖、不改名、不创建目录。", { path: file, reason, systemCode: systemCode(error), unattemptedFiles: planned.map(x => x.path) });
  const inputs = new Set();
  if (inputPath) {
    inputs.add(pathKey(inputPath));
    try { inputs.add(pathKey(io.realpathSync(inputPath))); }
    catch (error) { throw fail(path.resolve(inputPath), "无法核对输入文件的真实路径", error); }
  }
  const seen = new Set();
  for (const entry of planned) {
    if (process.platform === "win32") {
      const parts = entry.path.slice(path.parse(entry.path).root.length).split(/[\\/]/);
      if (parts.some(part => /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
        throw fail(entry.path, "Windows 输出名称非法或为保留名称；不允许备用数据流");
      }
    }
    const parent = path.dirname(entry.path);
    let parentInfo, realParent;
    try { parentInfo = io.statSync(parent); }
    catch (error) { throw fail(parent, "目标父目录不存在或不可访问", error); }
    if (!parentInfo.isDirectory()) throw fail(parent, "目标父路径不是目录");
    try { realParent = io.realpathSync(parent); }
    catch (error) { throw fail(parent, "无法核对目标父目录的真实路径", error); }
    const key = pathKey(path.join(realParent, path.basename(entry.path)));
    if (inputs.has(key) || inputs.has(pathKey(entry.path))) throw fail(entry.path, "输出目标不得与输入为同一路径");
    if (seen.has(key)) throw fail(entry.path, "输出计划包含重复目标");
    seen.add(key);
    let existing;
    try { existing = io.lstatSync(entry.path); }
    catch (error) { if (error.code !== "ENOENT") throw fail(entry.path, "无法确认目标是否已存在", error); }
    if (existing && (!maintenance || !existing.isFile() || existing.isSymbolicLink())) throw fail(entry.path, "输出目标已存在或不是可维护的普通模板文件");
  }
  return planned;
}
function writePrepared(planned, io, maintenance = false) {
  const completedFiles = [];
  for (let index = 0; index < planned.length; index++) {
    const entry = planned[index];
    let fd, created = false, failure, phase = "open";
    try {
      // 普通输出以 wx 独占创建；维护模式仅由 --templates 的固定两条路径调用。
      fd = io.openSync(entry.path, maintenance ? "w" : "wx");
      created = true;
      phase = "write";
      io.writeFileSync(fd, entry.content, { encoding: "utf8" });
    } catch (error) { failure = error; }
    if (fd !== undefined) {
      try { io.closeSync(fd); }
      catch (error) { if (!failure) { failure = error; phase = "close"; } }
    }
    if (!failure) {
      phase = "readback";
      try {
        const actual = io.readFileSync(entry.path);
        if (!Buffer.isBuffer(actual) || !actual.equals(Buffer.from(entry.content, "utf8"))) failure = new Error("读回内容不一致");
      } catch (error) { failure = error; }
    }
    if (failure) {
      const incompleteFiles = created ? [entry.path] : [];
      throw new ReviewError(phase === "readback" ? "ERR-OUT-04" : "ERR-OUT-05", 5,
        phase === "readback" ? "输出文件读回失败或内容不一致，不能认定整体成功。" : "输出写入未完成，不能认定整体成功。",
        "由执行者核对 completedFiles 与 incompleteFiles；后者可能为空、截断或仅未通过读回验证。保留现有文件供核对，用户仅补充业务事实。",
        { path: entry.path, phase, systemCode: systemCode(failure), completedFiles: [...completedFiles], incompleteFiles, untouchedFiles: created ? [] : [entry.path], unattemptedFiles: planned.slice(index + 1).map(x => x.path) },
        "未自动修复、未重试；已停止后续写入。完整写入并读回确认 " + completedFiles.length + " 个；可能不完整或未验证 " + incompleteFiles.length + " 个。" + (completedFiles.length || incompleteFiles.length ? "存在部分产物，详见文件清单；" : "未产生输出文件；") + "未删除已写文件，未修改输入文件。");
    }
    completedFiles.push(entry.path);
  }
  return { completedFiles, incompleteFiles: [], unattemptedFiles: [] };
}
function writeOutputs(entries, { io = fs, inputPath } = {}) {
  // 所有目标统一预检后才开始写入；每个目标仅执行一轮创建、写入、读回。
  return writePrepared(preflightOutputs(entries, io, inputPath), io);
}
const HELP = `需求审查可视化生成器 v2.4.1
用法：
  node build-review.js data.json output-basename [--format md+html|md|html | --no-html | format=md]
  node build-review.js --check data.json
  node build-review.js --demo existing-dir
  node build-review.js --templates
  node build-review.js --help | -h | help

默认生成 Markdown + HTML；显式格式覆盖有效 DATA.format，两份嵌入状态均记录生效格式，不修改输入。
--check 只读检查 DATA 结构、大小和统计，不生成文件。
输入仅接受严格 UTF-8 无 BOM；统一审查 DATA JSON 上限 8 MiB，与原始需求文档/原材料容量无关。
普通生成及 --demo 禁止覆盖；父目录必须已存在；全量预检后以 wx 单次写入并读回核对。
不自动修复、不重试、不换目录、不创建目录、不改名；写入中失败保留部分产物并停止后续写入。
--templates 是维护命令：仅允许覆盖 templates/fast-screen-card.html 和 templates/deep-review-radar.html 这两个固定文件，不改变普通输出的禁覆盖规则。
退出码：0 成功；2 参数；3 输入读取/编码/大小/JSON；4 DATA 契约；5 输出/读回；6 内部错误。
错误 stderr JSON：code + message（发生什么）+ handled（已做处理）+ next（建议下一步）+ details。
`;
function parseArgs(args) {
  if (args.length === 1 && ["--help", "-h", "help"].includes(args[0])) return { mode: "help" };
  if (args[0] === "--templates" && args.length === 1) return { mode: "templates" };
  const positional = x => typeof x === "string" && x.length > 0 && !x.startsWith("-") && !x.startsWith("format=");
  if (["--check", "--demo"].includes(args[0]) && args.length === 2 && positional(args[1])) return { mode: args[0].slice(2), input: args[1] };
  if (args.length < 2 || !positional(args[0]) || !positional(args[1]) || args[0] === "help") throw argumentError();
  const options = args.slice(2);
  let format;
  if (options.length === 1 && options[0] === "--no-html") format = "md";
  else if (options.length === 1 && /^(?:--)?format=/.test(options[0])) format = options[0].slice(options[0].indexOf("=") + 1);
  else if (options.length === 2 && options[0] === "--format") format = options[1];
  else if (options.length) throw argumentError();
  if (format !== undefined && !FORMATS.includes(format)) throw argumentError();
  return { mode: "generate", input: args[0], base: args[1], format };
}
function resultSummary(data, result) {
  return { kind: data.kind, limited:result.limited, warnings:result.warnings, checkCount: result.checks.length, findingCount: result.findings.length, pendingCount: result.open.length, confirmedCount: result.closed.length, count: result.count, level: result.level, verdict: result.verdict, score: result.score, rate: result.rate };
}
function runCLI(args) {
  const command = parseArgs(args);
  if (command.mode === "help") return HELP;
  if (command.mode === "templates") {
    const entries = ["fast", "deep"].map(kind => ({ path: path.join(root, "templates", kind === "fast" ? "fast-screen-card.html" : "deep-review-radar.html"), content: renderHTML({ ...demo(kind), format: "md+html" }) }));
    return { ok: true, mode: "templates", maintenance: "仅覆盖固定两个模板；普通生成仍禁止覆盖。", ...writePrepared(preflightOutputs(entries, fs, undefined, true), fs, true) };
  }
  if (command.mode === "demo") {
    const out = path.resolve(command.input);
    const entries = ["fast", "deep"].flatMap(kind => {
      const data = { ...demo(kind), format: "md+html" };
      const base = path.join(out, "v2.4.1-" + kind + "-demo");
      return [...outputPlan(data, base), { path: base + ".json", content: core.safeJSON(data) }];
    });
    return { ok: true, mode: "demo", effectiveFormat: "md+html", ...writeOutputs(entries) };
  }
  const input = readInput(command.input);
  const result = validateData(input.data);
  const summary = { ok: true, mode: command.mode, sizeBytes: input.sizeBytes, maxInputBytes: MAX_INPUT_BYTES, limitScope: "统一审查 DATA JSON；与原始文档容量无关", ...resultSummary(input.data, result) };
  if (command.mode === "check") return { ...summary, completedFiles: [], incompleteFiles: [], unattemptedFiles: [] };
  const format = command.format ?? input.data.format ?? "md+html";
  const entries = outputPlan(input.data, path.resolve(command.base), format);
  return { ...summary, effectiveFormat: format, ...writeOutputs(entries, { inputPath: input.path }) };
}
function main(args = process.argv.slice(2), streams = process) {
  let result;
  try {
    result = runCLI(args);
    streams.stdout.write(typeof result === "string" ? result : JSON.stringify(result, null, 2) + "\n");
    return 0;
  } catch (error) {
    const completedFiles = result?.completedFiles || [];
    const report = error instanceof ReviewError ? error : new ReviewError("ERR-INT-01", 6, "生成器发生未预期内部错误，未输出原始异常或堆栈。", "由执行者核对生成器与审查引擎版本，并使用脱敏数据定位；用户仅补充业务事实。", { completedFiles }, completedFiles.length ? "未自动修复、未重试；全部输出已写入并读回确认，无不完整文件，但成功结果反馈失败。未删除输出，未修改输入文件。" : NO_WRITE);
    streams.stderr.write(JSON.stringify(report.toJSON(), null, 2) + "\n");
    return report.exitCode;
  }
}
module.exports = { renderHTML, renderMarkdown, demo, outputPlan, writeOutputs, readInput, main, MAX_INPUT_BYTES, ReviewError };
if (require.main === module) process.exitCode = main();
