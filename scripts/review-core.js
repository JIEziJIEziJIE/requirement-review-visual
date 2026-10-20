/* Shared calculation contract, embedded verbatim in offline HTML. No dependencies. */
(function (root) {
  "use strict";
  const STATUS = { "已明确":100, "基本明确":75, "部分明确":45, "未明确":15, "不适用":null };
  const PRIORITY = ["P0", "P1", "P2", "P3"];
  const FAST = ["目标与范围", "主流程与完成标准", "业务规则与关键数据", "角色、权限与前置条件", "异常与边界", "状态与数据一致性", "依赖与交付条件", "验收与可追溯证据"];
  const DEEP = ["目标、范围与成功标准", "术语、文案与规则口径", "角色、权限与前置条件", "主流程与业务规则", "边界、容量与精度", "异常、失败与可恢复性", "状态流转与数据一致性", "数据结构、输入输出与接口", "兼容性与非功能要求", "页面、交互与视觉状态", "外部依赖、运营配置与发布窗口", "验收、回归与可观测性"];
  const text = v => typeof v === "string" && v.trim().length > 0;
  const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
  function classify(kind, lane, count, average, applicable, impacts) {
    if (!applicable) return { level:"unknown", verdict:"材料适用范围待确认，暂不判断" };
    if (kind === "deep") {
      if (count.P0 > 0 || average < 70) return { level:"fail", verdict:"需要先完成关键口径对齐" };
      if (average >= 85 && count.P1 === 0) return { level:"pass", verdict:"当前材料可支持用例设计" };
      return { level:"warn", verdict:"补充确认后可支持" };
    }
    const words = {
      product:["可提交评审", "建议补充后提交", "暂不建议提交"],
      dev:["可以进入开发", "补充确认后可以开发", "暂不建议直接开发"],
      test:["具备初步可测条件", "补充确认后可测", "暂不具备初步可测条件"]
    }[lane];
    const fail = lane === "product" ? impacts.some(x => x === "rework" || x === "cannot_close") : count.P0 > 0;
    const index = fail ? 2 : count.P0 > 0 || count.P1 > 0 ? 1 : 0;
    return { level:["pass", "warn", "fail"][index], verdict:words[index] };
  }
  function compute(data) {
    const errors = [];
    const need = (ok, message) => { if (!ok) errors.push(message); };
    if (!object(data)) return { ok:false, errors:["DATA 必须是对象"] };
    need(data.schemaVersion === 2, "schemaVersion 必须为 2；旧数据需迁移");
    need(["fast", "deep"].includes(data.kind), "kind 必须为 fast/deep");
    need(["product", "dev", "test"].includes(data.lane), "lane 必须为 product/dev/test");
    need(data.kind !== "deep" || data.lane === "test", "二级深审 lane 必须为 test；不覆盖产品/开发准入结论");
    need(data.lang === undefined || ["zh", "en"].includes(data.lang), "lang 必须为 zh/en");
    need(data.format === undefined || ["md+html", "md", "html"].includes(data.format), "format 必须为 md+html/md/html");
    ["title", "date", "reportId", "materialVersion"].forEach(k => need(text(data[k]), k + " 不能为空"));
    need(text(data.date) && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && Number.isFinite(Date.parse(data.date)) && new Date(data.date).toISOString().slice(0,10) === data.date, "date 必须为有效 YYYY-MM-DD");
    ["summary", "nextStepText"].forEach(k => need(data[k] === undefined || typeof data[k] === "string", k + " 必须为字符串"));
    ["changes", "acceptanceEvidence"].forEach(k => need(data[k] === undefined || Array.isArray(data[k]) && data[k].every(text), k + " 必须为非空文本数组"));
    need(Number.isInteger(data.revision) && data.revision > 0, "revision 必须为正整数");
    const top = data.top === undefined ? 8 : data.top;
    need(Number.isInteger(top) && top >= 1 && top <= 8, "top 必须为 1..8，只限制首屏展示");
    ["rate", "score", "index", "level", "verdict", "priorities", "counts", "items", "dims", "todos"].forEach(k => need(!(k in data), "禁止手填派生或旧字段：" + k));
    need(Array.isArray(data.materials) && data.materials.length > 0, "materials 必须提供材料及读取状态");
    if (Array.isArray(data.materials)) data.materials.forEach((m, i) => {
      need(object(m), "materials[" + i + "] 必须为对象");
      if (!object(m)) return;
      ["name", "source", "version", "role"].forEach(k => need(text(m[k]), "材料 " + (i + 1) + " 缺少 " + k));
      need(["已读全文", "部分读取", "读取失败"].includes(m.state), "材料 " + (i + 1) + " 读取状态非法");
    });
    const names = data.kind === "fast" ? FAST : DEEP;
    need(Array.isArray(data.checks) && data.checks.length === names.length, "checks 必须恰好 " + names.length + " 项");
    const checks = Array.isArray(data.checks) ? data.checks : [];
    checks.forEach((c, i) => {
      need(object(c), "检查项 " + (i + 1) + " 必须为对象");
      if (!object(c)) return;
      need(c.id === i + 1, "检查项 id 必须按顺序为 1.." + names.length);
      need(c.name === names[i], "检查项 " + (i + 1) + " 名称不匹配固定维度");
      need(Object.hasOwn(STATUS, c.status) && !(data.kind === "fast" && c.status === "基本明确"), "检查项 " + (i + 1) + " 状态非法");
      need(text(c.evidence), "检查项 " + (i + 1) + " 缺少依据/不适用原因");
      need(!("value" in c), "维度分数由状态计算，不填写 value");
    });
    need(Array.isArray(data.findings), "findings 必须为完整事项数组（无事项用 []）");
    const findings = [];
    const ids = new Set();
    (Array.isArray(data.findings) ? data.findings : []).forEach((f, i) => {
      const where = "事项 " + (i + 1);
      need(object(f), where + " 必须为对象");
      if (!object(f)) return;
      need(text(f.id) && (data.kind === "fast" ? /^Q[1-9]\d*$/.test(f.id) : /^建议\s?\d{3,}$/.test(f.id)), where + " 编号格式错误");
      need(!ids.has(f.id), where + " 编号重复"); ids.add(f.id);
      need(PRIORITY.includes(f.priority) && !(data.kind === "fast" && f.priority === "P3"), where + " 优先级非法");
      ["title", "owner", "location", "evidence", "fact", "advice", "testImpact", "type"].forEach(k => need(text(f[k]), where + " 缺少 " + k));
      need(!("closed" in f) && !("confirmed" in f), where + " 不允许手填关闭或确认标志");
      need(Array.isArray(f.affected) && f.affected.length > 0 && f.affected.every(n => Number.isInteger(n) && n >= 1 && n <= names.length) && new Set(f.affected).size === f.affected.length, where + " affected 必须为不重复的维度编号");
      let required = 0, answered = 0;
      for (const key of ["business", "technical"]) {
        const b = f[key];
        need(object(b) && typeof b.required === "boolean", where + " 缺少 " + key + ".required");
        if (!object(b)) continue;
        if (b.required) {
          required++;
          need(text(b.question), where + " " + key + " 缺少能直接回答的问题");
          need(text(b.answer) === text(b.source), where + " " + key + " 答案与确认来源必须同时提供");
          if (text(b.answer) && text(b.source)) answered++;
        } else {
          need(!text(b.answer) && !text(b.source), where + " 非必需确认项不得夹带答案");
        }
      }
      need(required > 0, where + " 至少需要一个确认对象");
      const open = required === 0 || answered < required;
      if (data.kind === "fast" && data.lane === "product" && f.priority === "P0" && open) need(["fill_rule", "rework", "cannot_close"].includes(f.impact), where + " 产品 P0 必须填写 impact");
      const doc = f.document === undefined ? { status:"未写入", evidence:"" } : f.document;
      const verification = f.verification === undefined ? { status:"未验证", evidence:"" } : f.verification;
      need(object(doc) && ["未写入", "正文已生成", "已写入"].includes(doc.status), where + " 文档状态非法");
      need(object(verification) && ["未验证", "已验证"].includes(verification.status), where + " 验证状态非法");
      if (object(doc) && doc.status !== "未写入") {
        need(text(doc.evidence), where + " 生成/写入必须有对应依据");
        need(answered > 0, where + " 生成/写入至少需要一个已确认分支，只补该分支内容");
      }
      if (object(verification) && verification.status === "已验证") need(text(verification.evidence), where + " 已验证必须有执行证据");
      findings.push({ ...f, open, confirmation:open ? (answered ? "部分确认" : "待确认") : "已确认", document:doc, verification });
    });
    if (errors.length) return { ok:false, errors };
    const open = findings.filter(f => f.open);
    const count = Object.fromEntries(PRIORITY.map(p => [p, open.filter(f => f.priority === p).length]));
    for (const c of checks) {
      const linked = open.filter(f => f.affected.includes(c.id));
      if (c.status === "不适用") need(linked.length === 0, "不适用维度 " + c.id + " 不应关联待确认事项");
      else if (c.status === "已明确") need(linked.length === 0, "维度 " + c.id + " 仍有关联待确认事项，不能标已明确");
      else need(linked.length > 0, "维度 " + c.id + " 非已明确但没有待确认依据；请复筛或补事项");
      if (data.kind === "deep" && linked.length) {
        const priority = PRIORITY.find(p => linked.some(f => f.priority === p));
        if (priority === "P0") need(c.status === "未明确", "P0 关联维度 " + c.id + " 必须为未明确");
        if (priority === "P1") need(["部分明确", "未明确"].includes(c.status), "P1 关联维度 " + c.id + " 不得标基本明确/已明确");
        if (["P2", "P3"].includes(priority)) need(["基本明确", "未明确"].includes(c.status), "仅P2/P3的维度 " + c.id + " 应为基本明确；完全未描述可为未明确");
      }
    }
    if (errors.length) return { ok:false, errors };
    const applicable = checks.filter(c => c.status !== "不适用");
    const average = applicable.length ? applicable.reduce((s, c) => s + STATUS[c.status], 0) / applicable.length : null;
    const readable = data.materials.some(m => m.state === "已读全文" || m.state === "部分读取");
    const result = readable ? classify(data.kind, data.lane, count, average, applicable.length, open.filter(f => f.priority === "P0").map(f => f.impact)) : { level:"unknown", verdict:"材料未能读取，暂不判断" };
    const sorted = [...open].sort((a,b) => PRIORITY.indexOf(a.priority) - PRIORITY.indexOf(b.priority));
    const clear = checks.filter(c => c.status === "已明确").length;
    const shown = [...sorted.filter(f => f.priority === "P0").slice(0,5), ...sorted.filter(f => f.priority !== "P0")].slice(0,top);
    const remaining = sorted.filter(f => !shown.includes(f));
    let nextStep = !readable ? "请提供可读取的需求材料，再进行审查。" : !applicable.length ? "请先确认本次需求范围；所有维度均不适用时不计算分数、不作准入判断。" : open.length ? "先回复 " + shown.map(f => f.id).join("、") + "；业务与研发分别确认，随后只复筛受影响项。" : "当前材料未发现关键缺口；可按本轮目标进入下一阶段，功能仍需实际验证。";
    if (readable && applicable.length && !open.length && findings.some(f => f.document.status !== "已写入")) nextStep += " 已确认事项若需补入需求，可先生成补充正文；编辑文件另行授权。";
    if (data.kind === "fast" && data.lane === "product" && count.P0 > 0 && result.level === "warn") nextStep += " 若 P0 在评审前无法关闭，应改判暂不建议提交。";
    if (readable && data.kind === "fast" && count.P0) nextStep += " 当前存在影响业务结果或实施条件的 P0，可按需做二级深审核对关联影响；也可先确认这些事项，不自动展开深审。";
    return { ok:true, ...result, readable, count, average:readable ? average : null, score:!readable || average === null ? null : Math.round(average), applicable:applicable.length, clear, rate:readable && applicable.length ? clear + "/" + applicable.length : "—", findings, open:sorted, closed:findings.filter(f => !f.open), shown, remaining, checks:checks.map(c => ({ ...c, value:readable ? STATUS[c.status] : null })), nextStep, top };
  }
  function safeJSON(data) {
    return JSON.stringify(data, null, 2).replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4,"0"));
  }
  const api = { compute, classify, safeJSON, STATUS, PRIORITY, FAST, DEEP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReviewCore = api;
})(typeof globalThis === "object" ? globalThis : this);
