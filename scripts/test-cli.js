"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const build = require("./build-review.js");
const core = require("./review-core.js");
const NODE = process.execPath;
const CLI = path.join(__dirname, "build-review.js");
assert.ok(fs.statSync(os.tmpdir()).isDirectory());
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "review-cli-v2.4.1-"));
const ownedFiles = new Set();
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("通过", name); }
  catch (error) { failed++; console.error("失败", name, error.stack); }
}
const file = name => path.join(temporary, name);
function fixture(name, content) {
  const dest = file(name);
  const fd = fs.openSync(dest, "wx");
  ownedFiles.add(dest);
  try { fs.writeFileSync(fd, content); } finally { fs.closeSync(fd); }
  return dest;
}
function run(args, outputs = []) {
  const absent = outputs.filter(dest => !fs.existsSync(dest));
  const result = spawnSync(NODE, [CLI, ...args], { encoding: "utf8", timeout: 20000, windowsHide: true });
  absent.forEach(dest => { if (fs.existsSync(dest)) ownedFiles.add(dest); });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
function success(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  return report;
}
function errorResult(result, exitCode, code) {
  assert.equal(result.status, exitCode, result.stderr);
  assert.equal(result.stdout, "");
  const report = JSON.parse(result.stderr);
  assert.equal(report.ok, false);
  assert.equal(report.code, code);
  for (const key of ["message", "handled", "next"]) assert.ok(report[key]);
  assert.match(report.handled, /未自动修复.*未重试/);
  for (const key of ["completedFiles", "incompleteFiles", "unattemptedFiles"]) assert.ok(Array.isArray(report.details[key]));
  assert.ok(!result.stderr.includes('"stack"'));
  return report;
}
const htmlData = text => JSON.parse(text.match(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/)[1]);
const mdData = text => JSON.parse(text.match(/<!-- review-data-v2\n([\s\S]*?)\n-->/)[1]);
function memoryIO({ failWrite, failRead, mismatch, failOpen, failClose } = {}) {
  const files = new Map(), descriptors = new Map();
  const calls = { open: [], write: [], close: [], read: [], flags: [] };
  let nextFD = 0;
  const fault = code => Object.assign(new Error("故障内容包含凭据 SECRET，不应输出"), { code });
  const io = {
    statSync: () => ({ isDirectory: () => true }),
    realpathSync: p => p,
    lstatSync: p => {
      if (!files.has(p)) throw fault("ENOENT");
      return { isFile: () => true, isSymbolicLink: () => false };
    },
    openSync: (p, flags) => {
      calls.open.push(p); calls.flags.push(flags);
      if (calls.open.length === failOpen) throw fault("EACCES");
      if (files.has(p)) throw fault("EEXIST");
      files.set(p, Buffer.alloc(0));
      descriptors.set(++nextFD, p);
      return nextFD;
    },
    writeFileSync: (fd, content, options) => {
      const p = descriptors.get(fd); calls.write.push(p);
      assert.equal(options.encoding, "utf8");
      if (calls.write.length === failWrite) { files.set(p, Buffer.from(content).subarray(0, 2)); throw fault("ENOSPC"); }
      files.set(p, Buffer.from(content));
    },
    closeSync: fd => {
      calls.close.push(descriptors.get(fd)); descriptors.delete(fd);
      if (calls.close.length === failClose) throw fault("EIO");
    },
    readFileSync: p => {
      calls.read.push(p);
      if (calls.read.length === failRead) throw fault("EIO");
      return calls.read.length === mismatch ? Buffer.from("不同内容") : files.get(p);
    }
  };
  return { io, calls, files };
}
function caught(fn) {
  let error;
  try { fn(); } catch (e) { error = e; }
  assert.ok(error instanceof build.ReviewError);
  return error;
}
class Element {
  constructor() { this.children = []; this.dataset = {}; this.text = ""; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(x => x.textContent).join("\n"); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute() {}
}
function browserError(raw, overrideCompute) {
  const html = build.renderHTML(build.demo("fast"));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const split = script.lastIndexOf("\n(function browserRender()");
  assert.ok(split > 0);
  const host = new Element(), data = new Element(); data.textContent = raw;
  const context = vm.createContext({ document: { getElementById: id => id === "review" ? host : data, createElement: () => new Element(), createElementNS: () => new Element() } });
  vm.runInContext(script.slice(0, split), context);
  if (overrideCompute) context.ReviewCore.compute = overrideCompute;
  vm.runInContext(script.slice(split), context);
  for (const text of ["发生什么", "已做处理", "建议下一步", "未自动修复", "未重试", "业务事实", "无需手写 JSON"]) assert.ok(host.textContent.includes(text), text);
  assert.equal(host.dataset.valid, "false");
  return host.textContent;
}
try {
  const inputData = build.demo("fast");
  inputData.title = "不得在诊断或成功摘要中泄露 PRIVATE_INPUT_SENTINEL";
  const inputBytes = Buffer.from(JSON.stringify(inputData));
  const input = fixture("data.json", inputBytes);
  for (const [label, options, extensions, effectiveFormat] of [
    ["默认双输出", [], ["html", "md"], "md+html"],
    ["显式双输出", ["--format", "md+html"], ["html", "md"], "md+html"],
    ["Markdown", ["--format", "md"], ["md"], "md"],
    ["HTML", ["--format", "html"], ["html"], "html"],
    ["no-html", ["--no-html"], ["md"], "md"],
    ["format等号", ["format=md"], ["md"], "md"],
    ["兼容双横线等号", ["--format=html"], ["html"], "html"]
  ]) test("真实 CLI 生成 " + label, () => {
    const base = file("output-" + label), outputs = extensions.map(ext => base + "." + ext);
    const raw = run([input, base, ...options], outputs), result = success(raw);
    assert.deepEqual(result.completedFiles, outputs);
    assert.equal(result.effectiveFormat, effectiveFormat);
    assert.deepEqual(result.incompleteFiles, []);
    assert.ok(!raw.stdout.includes("PRIVATE_INPUT_SENTINEL"));
    outputs.forEach(dest => {
      const text = fs.readFileSync(dest, "utf8");
      const embedded = dest.endsWith(".html") ? htmlData(text) : mdData(text);
      assert.deepEqual(embedded, { ...inputData, format: effectiveFormat });
      if (dest.endsWith(".html")) assert.ok(text.includes("<title>Requirement review · v2.4.1</title>"));
    });
    for (const ext of ["md", "html"]) if (!extensions.includes(ext)) assert.equal(fs.existsSync(base + "." + ext), false);
    assert.deepEqual(fs.readFileSync(input), inputBytes);
  });
  test("DATA.format 生效且显式双输出覆盖但不改源文件", () => {
    const data = { ...inputData, format: "md" }, bytes = Buffer.from(JSON.stringify(data));
    const source = fixture("format-data.json", bytes);
    const first = file("data-format"), second = file("override-format");
    assert.equal(success(run([source, first], [first + ".md"])).effectiveFormat, "md");
    assert.equal(fs.existsSync(first + ".html"), false);
    success(run([source, second, "--format", "md+html"], [second + ".html", second + ".md"]));
    assert.equal(htmlData(fs.readFileSync(second + ".html", "utf8")).format, "md+html");
    assert.equal(mdData(fs.readFileSync(second + ".md", "utf8")).format, "md+html");
    assert.deepEqual(fs.readFileSync(source), bytes);
  });
  test("outputPlan 只克隆数据且支持冻结对象", () => {
    const data = { ...build.demo("deep"), format: "html" };
    const snapshot = JSON.stringify(data);
    const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };
    freeze(data);
    const entries = build.outputPlan(data, "frozen", "md+html");
    assert.equal(htmlData(entries[0].content).format, "md+html");
    assert.equal(mdData(entries[1].content).format, "md+html");
    assert.equal(JSON.stringify(data), snapshot);
  });
  test("材料不可读时 Markdown 也保留生效格式的续审状态", () => {
    const data = build.demo("fast"); data.materials[0].state = "读取失败"; data.materials[0].coverage = "虚构读取失败，无正文可审查";
    assert.equal(mdData(build.outputPlan(data, "unreadable", "md")[0].content).format, "md");
  });
  for (const help of ["--help", "-h", "help"]) test(help + " 返回0并说明只读预检与限制", () => {
    const result = run([help]);
    assert.equal(result.status, 0); assert.equal(result.stderr, "");
    for (const term of ["--check", "8 MiB", "原材料", "BOM", "--templates", "仅允许覆盖", "退出码"]) {
      assert.ok(result.stdout.includes(term), term);
    }
  });
  for (const args of [[], ["--wat"], ["--repair"], ["--retry"], ["help", "extra"], ["--help", "extra"], ["--templates", "extra"], ["--demo"], ["--check"], ["--check", input, "extra"], [input], [input, file("unused"), "--wat"], [input, file("unused"), "--format"], [input, file("unused"), "--format", "pdf"], [input, file("unused"), "--no-html", "--format", "md"], [input, file("unused"), "format="], [input, "--bad-output"]]) {
    test("严格拒绝参数 " + JSON.stringify(args.map(x => x === input ? "data.json" : x)), () => errorResult(run(args), 2, "ERR-CLI-01"));
  }
  test("check 只读并返回大小和检查事项数，不泄露原文", () => {
    const before = fs.readdirSync(temporary).sort();
    const raw = run(["--check", input]), result = success(raw);
    assert.equal(result.mode, "check"); assert.equal(result.sizeBytes, inputBytes.length);
    assert.equal(result.maxInputBytes, 8 * 1024 * 1024); assert.equal(result.checkCount, 8); assert.equal(result.findingCount, 2);
    assert.deepEqual(result.completedFiles, []); assert.deepEqual(fs.readdirSync(temporary).sort(), before);
    assert.deepEqual(fs.readFileSync(input), inputBytes); assert.ok(!raw.stdout.includes("PRIVATE_INPUT_SENTINEL"));
  });
  for (const [label, bytes, code] of [
    ["错误JSON", Buffer.from('{"secret":"PRIVATE_SECRET",}'), "ERR-IN-05"],
    ["非法UTF8", Buffer.from([0x7b, 0xc3, 0x28, 0x7d]), "ERR-IN-03"],
    ["UTF8 BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), inputBytes]), "ERR-IN-04"]
  ]) test(label + " 结构化拒绝且不改输入", () => {
    const source = fixture(label + ".json", bytes), base = file(label + "-out");
    const raw = run([source, base], [base + ".html", base + ".md"]);
    errorResult(raw, 3, code);
    assert.ok(!raw.stderr.includes("PRIVATE_SECRET")); assert.deepEqual(fs.readFileSync(source), bytes);
    assert.equal(fs.existsSync(base + ".html"), false); assert.equal(fs.existsSync(base + ".md"), false);
  });
  test("不存在输入", () => errorResult(run(["--check", file("missing.json")]), 3, "ERR-IN-01"));
  test("目录不能作为输入", () => errorResult(run(["--check", temporary]), 3, "ERR-IN-01"));
  test("契约错误返回4且不输出文件", () => {
    const source = fixture("invalid-data.json", JSON.stringify({ ...inputData, schemaVersion: 1 })), base = file("invalid-out");
    const result = errorResult(run([source, base], [base + ".html", base + ".md"]), 4, "ERR-OUT-03");
    assert.ok(result.details.messages.length); assert.equal(fs.existsSync(base + ".html"), false);
    errorResult(run(["--check", source]), 4, "ERR-OUT-03");
  });
  test("显式格式不能掩盖源DATA非法format", () => {
    const source = fixture("invalid-format.json", JSON.stringify({ ...inputData, format: "pdf" }));
    errorResult(run([source, file("invalid-format-out"), "--format", "md"]), 4, "ERR-OUT-03");
  });
  test("JSON null 返回契约错误而非堆栈", () => errorResult(run(["--check", fixture("null.json", "null")]), 4, "ERR-OUT-03"));
  test("8 MiB 实际输入超过上限被拒绝", () => {
    const source = fixture("oversize.json", Buffer.alloc(build.MAX_INPUT_BYTES + 1, 32));
    const result = errorResult(run(["--check", source]), 3, "ERR-IN-02");
    assert.equal(result.details.sizeBytes, build.MAX_INPUT_BYTES + 1); assert.ok(result.message.includes("不是原始需求文档"));
  });
  test("恰好8 MiB的有效DATA可以只读预检", () => {
    const content = Buffer.alloc(build.MAX_INPUT_BYTES, 32); inputBytes.copy(content);
    const result = success(run(["--check", fixture("exact-limit.json", content)]));
    assert.equal(result.sizeBytes, build.MAX_INPUT_BYTES);
  });
  test("stat先验超限时不调用read", () => {
    let reads = 0;
    const io = { statSync: () => ({ isFile: () => true, size: build.MAX_INPUT_BYTES + 1 }), readFileSync: () => { reads++; } };
    assert.equal(caught(() => build.readInput(input, io)).code, "ERR-IN-02"); assert.equal(reads, 0);
  });
  test("read后再次验证真实字节数且只读一次", () => {
    let reads = 0;
    const io = { statSync: () => ({ isFile: () => true, size: 1 }), readFileSync: () => { reads++; return Buffer.alloc(build.MAX_INPUT_BYTES + 1); } };
    assert.equal(caught(() => build.readInput(input, io)).code, "ERR-IN-02"); assert.equal(reads, 1);
  });
  test("第二目标同名时全量预检不写第一文件", () => {
    const base = file("collision"), existing = fixture("collision.md", "原文件保持不变");
    const result = errorResult(run([input, base], [base + ".html"]), 5, "ERR-OUT-01");
    assert.equal(fs.existsSync(base + ".html"), false); assert.equal(fs.readFileSync(existing, "utf8"), "原文件保持不变");
    assert.deepEqual(result.details.completedFiles, []); assert.deepEqual(result.details.incompleteFiles, []);
  });
  test("缺失输出父目录不创建目录", () => {
    const base = path.join(temporary, "not-created", "report");
    errorResult(run([input, base]), 5, "ERR-OUT-01"); assert.equal(fs.existsSync(path.dirname(base)), false);
  });
  test("输出父路径是文件时不写出", () => errorResult(run([input, path.join(input, "report")]), 5, "ERR-OUT-01"));
  test("输出与输入同路径被拒绝并保护输入", () => {
    const source = fixture("same.md", inputBytes);
    const result = errorResult(run([source, file("same"), "--format", "md"]), 5, "ERR-OUT-01");
    assert.ok(result.details.reason.includes("同一路径")); assert.deepEqual(fs.readFileSync(source), inputBytes);
  });
  if (process.platform === "win32") test("Windows非法名称返回结构化输出错误", () => {
    const base = file("invalid:name");
    const result = run([input, base], [base + ".html", base + ".md"]);
    assert.equal(result.status, 5); assert.equal(result.stdout, "");
    const report = JSON.parse(result.stderr); assert.ok(["ERR-OUT-01", "ERR-OUT-05"].includes(report.code));
    assert.match(report.handled, /未自动修复.*未重试/);
  });
  if (process.platform === "win32") test("Windows非法名与保留名均在创建前拒绝", () => {
    for (const name of ["bad:name.md", "CON.html", "NUL.md", "COM1.md", "bad?.md", "bad.md.", "bad.md "]) {
      const { io, calls } = memoryIO();
      const error = caught(() => build.writeOutputs([{ path: file(name), content: "测试内容" }], { io }));
      assert.equal(error.code, "ERR-OUT-01"); assert.equal(calls.open.length, 0);
    }
  });
  test("demo任一目标冲突时不产生其他五份文件", () => {
    const targets = ["fast", "deep"].flatMap(kind => ["html", "md", "json"].map(ext => file("v2.4.1-" + kind + "-demo." + ext)));
    const conflict = fixture("v2.4.1-deep-demo.json", "保留已有示例");
    errorResult(run(["--demo", temporary], targets.filter(x => x !== conflict)), 5, "ERR-OUT-01");
    for (const dest of targets) if (dest !== conflict) assert.equal(fs.existsSync(dest), false);
    assert.equal(fs.readFileSync(conflict, "utf8"), "保留已有示例");
    fs.unlinkSync(conflict); ownedFiles.delete(conflict);
  });
  test("demo一次生成六份v2.4.1文件", () => {
    const targets = ["fast", "deep"].flatMap(kind => ["html", "md", "json"].map(ext => file("v2.4.1-" + kind + "-demo." + ext)));
    const result = success(run(["--demo", temporary], targets));
    assert.deepEqual(result.completedFiles, targets);
    for (const kind of ["fast", "deep"]) {
      const base = file("v2.4.1-" + kind + "-demo");
      assert.ok(fs.readFileSync(base + ".html", "utf8").includes("<title>Requirement review · v2.4.1</title>"));
      assert.deepEqual(htmlData(fs.readFileSync(base + ".html", "utf8")), JSON.parse(fs.readFileSync(base + ".json", "utf8")));
      assert.deepEqual(mdData(fs.readFileSync(base + ".md", "utf8")), JSON.parse(fs.readFileSync(base + ".json", "utf8")));
    }
  });
  test("demo目录缺失时不创建", () => errorResult(run(["--demo", file("missing-demo-dir")]), 5, "ERR-OUT-01"));
  const entries = [1, 2, 3].map(i => ({ path: file("memory-" + i + ".md"), content: "完整内容 " + i }));
  test("注入IO正常每个文件仅一次wx/write/read", () => {
    const { io, calls } = memoryIO(), result = build.writeOutputs(entries, { io });
    assert.deepEqual(result.completedFiles, entries.map(x => x.path));
    for (const key of ["open", "write", "close", "read"]) assert.deepEqual(calls[key], entries.map(x => x.path));
    assert.deepEqual(calls.flags, ["wx", "wx", "wx"]);
  });
  test("第二次写失败保留第一文件并准确区分部分文件", () => {
    const { io, calls, files } = memoryIO({ failWrite: 2 });
    const error = caught(() => build.writeOutputs(entries, { io }));
    assert.equal(error.exitCode, 5); assert.equal(error.code, "ERR-OUT-05");
    assert.deepEqual(error.details.completedFiles, [entries[0].path]);
    assert.deepEqual(error.details.incompleteFiles, [entries[1].path]);
    assert.deepEqual(error.details.unattemptedFiles, [entries[2].path]);
    assert.equal(files.get(entries[0].path).toString(), entries[0].content);
    assert.equal(files.get(entries[1].path).length, 2); assert.equal(files.has(entries[2].path), false);
    assert.equal(calls.write.length, 2); assert.equal(calls.read.length, 1); assert.equal(calls.close.length, 2);
    assert.ok(!JSON.stringify(error.toJSON()).includes("SECRET"));
  });
  test("第二次打开失败不得把未触碰文件称为部分写入", () => {
    const { io, calls } = memoryIO({ failOpen: 2 });
    const error = caught(() => build.writeOutputs(entries, { io }));
    assert.deepEqual(error.details.completedFiles, [entries[0].path]); assert.deepEqual(error.details.incompleteFiles, []);
    assert.deepEqual(error.details.untouchedFiles, [entries[1].path]); assert.deepEqual(error.details.unattemptedFiles, [entries[2].path]);
    assert.equal(calls.open.length, 2); assert.equal(calls.write.length, 1); assert.equal(calls.read.length, 1);
  });
  for (const option of ["failRead", "mismatch"]) test(option + "读回失败保留文件但不声明完整", () => {
    const { io, calls, files } = memoryIO({ [option]: 2 });
    const error = caught(() => build.writeOutputs(entries, { io }));
    assert.equal(error.code, "ERR-OUT-04"); assert.equal(error.exitCode, 5);
    assert.deepEqual(error.details.completedFiles, [entries[0].path]); assert.deepEqual(error.details.incompleteFiles, [entries[1].path]);
    assert.deepEqual(error.details.unattemptedFiles, [entries[2].path]);
    assert.equal(files.get(entries[1].path).toString(), entries[1].content); assert.equal(files.has(entries[2].path), false);
    assert.equal(calls.read.length, 2); assert.equal(calls.write.length, 2);
  });
  test("首次写失败也保留可能部分文件且停止", () => {
    const { io, calls } = memoryIO({ failWrite: 1 });
    const error = caught(() => build.writeOutputs(entries, { io }));
    assert.deepEqual(error.details.completedFiles, []); assert.deepEqual(error.details.incompleteFiles, [entries[0].path]);
    assert.equal(calls.write.length, 1); assert.equal(calls.read.length, 0);
  });
  test("关闭失败停止且不重复关闭或读回", () => {
    const { io, calls } = memoryIO({ failClose: 1 });
    const error = caught(() => build.writeOutputs(entries, { io }));
    assert.equal(error.details.phase, "close"); assert.deepEqual(error.details.incompleteFiles, [entries[0].path]);
    assert.equal(calls.close.length, 1); assert.equal(calls.read.length, 0);
  });
  test("预检后同名竞争由wx拒绝且不覆盖", () => {
    const { io, calls, files } = memoryIO();
    const originalOpen = io.openSync;
    io.openSync = (p, flag) => { files.set(p, Buffer.from("并发写入的原文件")); return originalOpen(p, flag); };
    const error = caught(() => build.writeOutputs(entries, { io }));
    assert.equal(error.code, "ERR-OUT-05"); assert.equal(error.details.systemCode, "EEXIST");
    assert.deepEqual(error.details.incompleteFiles, []); assert.equal(calls.write.length, 0);
    assert.equal(files.get(entries[0].path).toString(), "并发写入的原文件");
  });
  test("重复目标统一预检失败不调用write", () => {
    const { io, calls } = memoryIO();
    assert.equal(caught(() => build.writeOutputs([entries[0], entries[0]], { io })).code, "ERR-OUT-01");
    assert.equal(calls.open.length, 0); assert.equal(calls.write.length, 0);
  });
  test("不同父目录后一个无效时不写第一个", () => {
    const { io, calls } = memoryIO();
    io.statSync = p => ({ isDirectory: () => !p.endsWith("bad-parent") });
    const later = { path: path.join(temporary, "bad-parent", "last.md"), content: "内容" };
    assert.equal(caught(() => build.writeOutputs([entries[0], later], { io })).code, "ERR-OUT-01");
    assert.equal(calls.open.length, 0);
  });
  test("渲染内部异常返回6且不泄露堆栈或原文", () => {
    const original = core.compute, output = { stdout: "", stderr: "" };
    const streams = Object.fromEntries(Object.keys(output).map(k => [k, { write: s => { output[k] += s; } }]));
    try {
      core.compute = () => { throw new Error("PRIVATE_SECRET"); };
      const status = build.main([input, file("internal-error")], streams);
      errorResult({ status, ...output }, 6, "ERR-INT-01");
      assert.ok(!output.stderr.includes("PRIVATE_SECRET")); assert.equal(fs.existsSync(file("internal-error.html")), false);
    } finally { core.compute = original; }
  });
  test("成功反馈通道异常仍准确报告已完成文件", () => {
    const base = file("stdout-failure"), outputs = [base + ".html", base + ".md"];
    let stderr = "";
    let status;
    try {
      status = build.main([input, base], { stdout: { write: () => { throw new Error("PRIVATE_SECRET"); } }, stderr: { write: text => { stderr += text; } } });
    } finally { outputs.forEach(dest => { if (fs.existsSync(dest)) ownedFiles.add(dest); }); }
    const report = errorResult({ status, stdout: "", stderr }, 6, "ERR-INT-01");
    assert.deepEqual(report.details.completedFiles, outputs); assert.deepEqual(report.details.incompleteFiles, []);
    assert.ok(report.handled.includes("全部输出已写入")); assert.ok(!stderr.includes("PRIVATE_SECRET"));
  });
  test("浏览器JSON错误有三段且不回显原文", () => assert.ok(!browserError('{"secret":"PRIVATE_SECRET",}').includes("PRIVATE_SECRET")));
  test("浏览器DATA契约错误有三段", () => assert.ok(browserError("null").includes("ERR-OUT-03")));
  test("浏览器显示core issues字段路径", () => assert.ok(browserError("{}", () => ({ ok: false, issues: [{ path: "checks[0].evidence", message: "缺少依据" }] })).includes("checks[0].evidence")));
  test("浏览器引擎异常安全拦截且不泄露原异常", () => assert.ok(!browserError("{}", () => { throw new Error("PRIVATE_SECRET"); }).includes("PRIVATE_SECRET")));
  test("HTML嵌入当前最新引擎且不新增重试按钮", () => {
    const html = build.renderHTML(build.demo("fast"));
    assert.ok(html.includes(fs.readFileSync(path.join(__dirname, "review-core.js"), "utf8")));
    assert.ok(!html.includes("<button"));
  });
} finally {
  // 仅清理本测试私有子目录中明确登记的文件；绝不递归删除或扫描清理个人目录。
  for (const dest of ownedFiles) {
    assert.equal(path.dirname(dest), temporary);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  }
  fs.rmdirSync(temporary);
}
console.log(JSON.stringify({ passed, failed, note: "包含真实 CLI 与注入 IO 故障；未执行模板维护、发布或 GitHub 操作。" }));
process.exitCode = failed ? 1 : 0;
