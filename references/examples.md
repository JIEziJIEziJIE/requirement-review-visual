# 数据契约、虚构示例与验收

本文件中的会议室预约为完全虚构材料，不来自用户需求或同事反馈。两个完整数据和可打开页面位于 HTML 模板；示例由 `scripts/build-review.js` 的 demo 函数生成，避免文档另抄一套数字再次失配。

## 1. 使用路径（执行者，不要求使用者写代码）

1. 按 8 项/12 维审查原文，确认当前目标与已读范围。
2. 维护 schemaVersion=2 的统一数据；所有判断有原文或确认依据，不猜值。
3. 用 `scripts/review-core.js` 的 compute 校验和计算；也可用 `--check` 只读检查准备好的 DATA JSON。
4. 校验通过后，调用 `scripts/build-review.js` 生成所请求格式；生成前确定目标路径，不要求普通使用者手填 JSON。
5. 用户要求回填后仅复筛受影响维度；明确要求更新文件才从同一更新数据生成，不直接改渲染数字。

规则分工为 SKILL 路由/边界、review-core 字段/计算、build-review 写入、references 细则。检测到冲突时停止受影响环节，指出位置并请维护确认，不擅自选择某一处继续。

### 1.1 运行条件与命令

Node 推荐 22 / 24，本机实测版本 22.22.2；零 npm 依赖，不声称跨平台全测。以下命令以技能根目录为工作目录，路径只是占位示例，需换为实际输入和**预先存在**的输出目录；不会替用户创建目录。含空格路径须加引号。普通使用者仍通过对话调用，无需运行脚本。

```bash
node scripts/build-review.js --help
node scripts/build-review.js -h
node scripts/build-review.js help
node scripts/build-review.js --check data.json
node scripts/build-review.js data.json /existing/output/review-r2
node scripts/build-review.js data.json /existing/output/review-r3 --format md
node scripts/build-review.js data.json /existing/output/review-r4 --no-html
node scripts/build-review.js data.json /existing/output/review-r5 format=html
node scripts/build-review.js data.json /existing/output/review-r6 --format=md+html
node scripts/build-review.js --demo /existing/output
```

- `--help`、`-h`、`help` **单独调用**时打印帮助、退出 0，不读写 DATA 或输出；不把带多余参数的帮助组合视为合法。
- `--check data.json` 只读检查输入编码、大小、JSON、DATA 契约及统计，不生成报告、不改原文件。退出 0 表示检查成功，不代表需求通过或功能验证完成。
- 保留 `data.json output-basename` 的原生成语法；可选一个格式指定形式：`--format md+html|md|html`、`--format=...`、`format=...` 或 `--no-html`。不能拼接多个格式选项或加入未声明选项。
- 无显式格式时按合法 DATA.format，否则默认 md+html；**显式格式只写入输出所嵌入的 DATA 副本，不修改原 DATA 对象或输入文件**。先校验原 DATA，不能用 CLI 格式覆盖掩盖非法 DATA.format。
- 未知选项、非法值、缺失/多余参数、重复或冲突组合严格拒绝，`ERR-CLI-01` / 退出 2。不接受对话的 depth/lane/top/lang 作为 CLI 开关，不存在自动修复或自动重试选项。
- 对话中遇未知/非法/矛盾参数，提示并问一个最小澄清；CLI 则直接拒绝，不交互、不忽略、不自动收敛。

### 1.2 输入与输出保护

输入为严格 UTF-8 无 BOM 的普通 DATA JSON 文件，最大 **8 MiB（8 × 1024 × 1024 字节）**；超限、非法 UTF-8、BOM、JSON 语法或 DATA 契约失败均停止，不修复、不截断、不重试。这个上限只保护生成 DATA，**不是原始需求文件大小或页数限制**。大文档处理见 [材料说明](material-handling.md)。

普通生成以 basename 加 `.html` / `.md` 输出；所有目标先统一预检，父目录须存在，任何目标已存在都拒绝。通过后 `wx` 独占创建，每个目标单次写入并读回；不覆盖、不换目录、不建目录、不改名、不修复、不重试。无法保证多文件原子提交；I/O 中途失败保留已写文件，停止后续目标，报告 `completedFiles/incompleteFiles/unattemptedFiles/untouchedFiles`，不删除、不称整体成功。清单语义见 [错误码](error-codes.md)。

Markdown 末尾 `review-data-v2` 注释与 HTML 数据区保留同一交付 DATA，便于继续回填，不得藏不应交付的信息；可见正文保留关联检查项编号。部分读取的限定放页面和 Markdown 开头，不能仅藏在数据区或材料折叠区。

`--demo` 一次计划六个文件：`v2.4.1-fast-demo` 与 `v2.4.1-deep-demo` 各有 `.html/.md/.json`，六个目标统一预检且不覆盖。任一目标碰撞时，本轮全部不开始写入。

`node scripts/build-review.js --templates` **仅供授权维护**：固定覆盖 `templates/fast-screen-card.html`、`templates/deep-review-radar.html` 两个 HTML 模板，仍统一预检、单次写入并读回；不是日常生成或回填命令，不提供任意路径覆盖。

CLI 退出码：0 成功，2 参数，3 输入，4 DATA，5 输出，6 内部。错误 stderr 为 JSON，含 `code/message/handled/next/details`，不输出堆栈、不回显 JSON 原文片段；具体映射见 [error-codes.md](error-codes.md)。这些命令是使用说明，不表示本轮已执行。

## 2. DATA 字段约定

### 顶层

| 字段 | 含义 |
|---|---|
| schemaVersion | 固定 2 |
| kind | fast / deep |
| lane | product / dev / test；deep 固定 test |
| lang | zh / en，默认 zh |
| format | 可选 md+html / md / html；生成命令显式参数优先 |
| title / date | 需求标题与实际审查日期 |
| reportId / revision | 稳定报告编号 / 正整数修订号 |
| materialVersion | 当前已读材料版本；未知如实标注，不伪造 |
| top | 1～8，仅控制首屏展示 |
| materials | 完整材料数组：name/source/version/state/role/coverage；state 为已读全文/部分读取/读取失败；coverage 规则见下 |
| checks | 严格按原顺序的 8 或 12 项，见下表 |
| findings | 完整事项数组；无事项用 []，关闭事项仍保留 |
| changes | 可选，本轮具体改动说明数组 |
| summary | 可选字符串，二级整体判断，只引用已读事实 |
| nextStepText | 可选字符串；不是覆盖派生 nextStep 或准入结论的入口 |
| acceptanceEvidence | 可选，二级六类验收证据提示数组 |

不允许手填 rate/score/index/level/verdict/priorities/counts，也不能把计算结果的 limited/warnings/nextStep 写回 DATA。旧版 items/dims/todos 必须按原材料映射为 checks/findings；旧数据缺确认对象或证据时先确认必要信息，不能凭旧分数猜原文。

**所有已声明对象层级都拒绝未知字段**：顶层、materials、checks、findings、business/technical、document/verification 的拼错键都不能默默丢弃。所有已声明的可选文本字段，提供时必须是 string；不能用 null、数字、布尔、数组或 object 代替，不做隐式字符串转换。可选不等于可以填任意类型；是否允许空字符串还须满足该字段的业务规则。

例如 checks 的 advice/label/short、findings 的 technicalNotes、确认分支的 question/answer/source、document/verification 的 evidence、materials 的 coverage，均按文本契约校验。`changes`、`acceptanceEvidence` 是数组，元素须为非空字符串，不是单个字符串。

失败结果有 `issues` 数组，每项以 `code/path/message` 指向字段，CLI 将其放入 `details.issues`；不自动改错键、删字段、填值或修编号。首次按证据组织合法 DATA 是正常生成，不属于失败后的自动修复。

### 材料 materials 与局部范围

`name/source/version/state/role` 为必填文本。`coverage` 在“已读全文”时可选，非全文（部分读取或读取失败）必须为非空字符串，描述已读/未读范围或失败原因。全部读取失败时各条也必须填 coverage，不能仅标 state。

下面是虚构的材料字段片段，**不是可直接生成报告的完整 DATA**：

```json
{
  "name": "会议室预约需求（虚构）",
  "source": "用户粘贴的章节正文",
  "version": "v1",
  "state": "部分读取",
  "role": "主需求",
  "coverage": "已读第1～2章；第3～5章及附录未提供，权限与恢复规则尚未核对。"
}
```

有可读材料且至少一份非全文时，compute 返回 `limited:true` 和含 `WARN-MAT-01` 的 warnings。页面与 Markdown 开头显著限定“仅基于已读范围的局部审查，不代表整份需求已通过”，材料记录展示范围；原判定函数及评分逻辑不变。全部不可读仍停止正常评分和准入判断，不能用局部提示包装成正常结论。

schemaVersion 仍为 2。v2.4.0 合法完整数据可用；过去宽松允许的非法键、非文本类型或非全文缺 coverage 不再接受，须由执行者依据原材料和实际读取记录确认补足，禁止自动修复或猜值。

### 检查项 checks

- id：固定顺序 1..8 / 1..12；name：与原标准名称完全一致。
- status：一级四档，二级五档；不手填 value，分值按状态计算。
- evidence：原文位置、已确认依据或不适用原因，必填。
- advice：可选，业务化的补充方向；无缺口可空。
- label / short：可选，显示用译名/短名，不能替代规范 name 与 id。

适用且非已明确项必须关联未关闭事项；已明确和不适用项不得关联未关闭事项。二级 P0 对应未明确，P1 对应部分明确（完全未描述可未明确），仅 P2/P3 对应基本明确（完全未描述可未明确）。语义判断由执行者按证据完成，脚本只拦截结构矛盾。

### 完整事项 findings

| 字段 | 内容 |
|---|---|
| id | 一级 Q1/Q2…；二级建议 001/建议 002…；“建议001”“建议 001”及补零后的同号按重复检测，不自动改编号 |
| title | 原始事项标题；改说明时不擅改追溯基线 |
| priority | 一级 P0/P1/P2；二级可含 P3 |
| type / evidence / fact / advice / testImpact / owner | 对应建议类型、依据位置、材料事实、建议调整、测试影响、确认对象；两级均保留 |
| location | 实际建议补充章节与原文锚点；未知如实说明，不能生成虚假页码 |
| affected | 关联检查项 id 数组，非空、无重复 |
| impact | product 的开放 P0 必填 fill_rule / rework / cannot_close |
| business / technical | 分别记录业务结果与实现确认，见下 |
| document | 可省略，默认 status=未写入、evidence=""；显式 status 为未写入/正文已生成/已写入，生成/写入须 evidence |
| verification | 可省略，默认 status=未验证、evidence=""；显式 status 为未验证/已验证，已验证须实际 evidence |
| technicalNotes | 可选，接口、字段、实现术语和技术证据 |

business/technical 结构均为：

```json
{
  "required": true,
  "question": "对方可以直接回答的问题",
  "answer": "",
  "source": ""
}
```

- required 必须显式布尔；至少一个分支 required=true。
- 未确认时 answer/source 为空；有明确答案时两者同时填写。只有来源不代表答案已定。
- required=false 的分支不得塞入答案；不需要研发确认的纯业务问题可以只启用 business。
- 所有 required 分支有答案与实际来源才关闭。不能手填 closed/confirmed。
- 来源存在不保证真假；执行者仍须核对实际消息与原文，不接受“应该如此”当明确确认。
- 文档写入与功能验证独立，未做不得声称做了；可部分补写已确认的业务段落而保留研发待确认。

## 3. 示例一：一级产品自检

查看 `templates/fast-screen-card.html`：完全虚构的会议室预约，8 项中 4 项已明确，因此 4/8。Q1=P0，涉及重复提交的业务与实现；Q2=P1，涉及身份范围。Q1 属填口径，不涉及方案重做，产品结论为“建议补充后提交”，并提示 P0 评审前不能关闭则改判。

同一数据若用户目标改为开发或测试，结论分别是“暂不建议直接开发”或“暂不具备初步可测条件”，不能把产品的有条件结论搬过去。

产品回复 Q1：“只保留一条预约，第二次展示现有预约记录。”这是虚构演示回复，不是默认业务规则。此时只写 business.answer/source，technical 仍开放，Q1 不关闭、分数不自动变好。研发明确实现并给出来源后，再复筛关联维度；Q2 未关闭的维度仍保留待确认。

## 4. 示例二：二级深审

查看 `templates/deep-review-radar.html`：12 个维度中 1 个不适用，适用 11 个的分值为：

100、75、15、75、45、15、45、75、100、45、75。

合计 665，均值 665/11≈60.45，显示 60；P0=1、P1=1、P2=1，结论“需要先完成关键口径对齐”。优先级按事项计数，不按一个事项涉及几个维度重复计数。

“兼容非功能”在此演示特意限定为不在规则文本演示范围；真实需求不得因“后台系统”就默认不需要性能、安全、兼容要求。

## 5. 答案回填的四小段示例

- 已关闭事项：无；仅收到 Q1 业务答案。
- 仍待确认事项：Q1 研发实现；Q2 不同身份范围。
- 变更的维度与优先级：记录 Q1 业务确认依据；由于实现未确认，相关状态与 P0 暂不变。
- 更新后结论：仍为“建议补充后提交”，原因是 Q1 尚未完整关闭。

若用户进一步要求补文档，给实际章节位置 + 可粘贴业务正文 + Q1 依据。明确要求编辑才写修订副本，保存读回后标已写入；仍标功能未验证。

## 6. 失败与边界示例（虚构，不冒充用户负评）

| 场景 | 应有结果 | 不允许的捷径 |
|---|---|---|
| 把 checks[0].advice 写成 null，或新增拼错字段 advcie | ERR-OUT-03，issues 指向字段，退出 4，不生成 | 转成空字符串或静默丢键 |
| 同时出现“建议001”和“建议 0001” | 检出同号重复，停止生成，先核对原编号映射 | 自动合并、删一条或重编号 |
| state=部分读取但 coverage 缺失 | ERR-OUT-03，需依据实际材料确认范围 | 把 state 改成已读全文绕过 |
| DATA JSON 有 BOM、非法 UTF-8 或语法错误 | 分别 ERR-IN-04 / 03 / 05，退出 3，不改输入 | 自动去 BOM、替换字节或补 JSON |
| --format 指定合法值但原 DATA.format 非法 | 先拒绝原 DATA，不以显式格式掩盖错误 | 为让校验通过先替换源数据 |
| 默认双输出中已有一个同名目标 | 全量预检 ERR-OUT-01，两个目标都不开始写入 | 先写另一个、覆盖或自动加后缀 |
| 第一个目标写完读回，第二个写入失败 | ERR-OUT-05，退出 5，分别记录完成与可能不完整文件，停止 | 宣称双输出成功、删除半成品、自动补写 |
| 文件写完但读回不一致 | ERR-OUT-04，列入 incompleteFiles，停止后续写入 | 把“写过”当成“已验证完成” |
| --demo 六个目标之一存在 | 六个目标一起预检失败，本轮不写 | 部分生成、改名绕过冲突 |
| 只给第 1～2 章，却请求全文通过结论 | 明示局部审查和未读缺口，不能全文背书 | 把摘要、目录或猜测补成正文 |

这些是可验证的边界用例，不是声称已执行的测试或新增负面反馈。没有自动修复/自动重试是明确设计；用户新授权后按确认事实开展新一轮操作不在此禁止范围内。

## 7. 验收与回归

在技能根目录分别运行，不用 npm 安装：

```bash
node scripts/test-review.js
node scripts/test-cli.js
```

`test-review.js` 用于同源计算、渲染与数据契约；`test-cli.js` 用于 CLI 和文件行为。v2.4.1 在 Windows / Node 22.22.2 实测分别93项和69项通过；这是对应版本的回归记录，后续改动须重新执行。下面的用户试用目标不等于已验证。

- 计算/渲染验收：P0/P1、产品分支、未取整阈值、全不适用/全不可读、首屏上限、确认来源、部分确认、写入/验证证据、安全文本、双输出一致；新增未知字段、可选文本类型、同号重复、coverage 与局部警告。
- CLI 验收：帮助退出 0、只读 check、原生成语法、未知/多余/冲突参数、严格编码/BOM/大小/JSON、DATA 拒绝、格式副本不改输入、全量预检、wx 不覆盖、写入/读回中途失败清单、退出码与安全错误 JSON。
- 维护验收：demo 六文件预检不覆盖，templates 仅两个固定 HTML 路径的维护例外；模板与生成器一致。完整 YAML、链接、版本、脱敏、图标和授权发布清单见 [README](../README.md)。

真实试用不由脚本替代。给同事脱敏材料，逐项确认：
- 无需作者解释，也能说出问题在问什么、如何直接回答、实现问题转给谁。
- 只回一个事项时只更新受影响部分，不凭空关闭其它事项。
- 补充正文可放到实际章节，未确认内容未混入；仅授权后写副本，原件不被悄悄覆盖。
- 局部审查开头可见，未读章节和跨章影响清楚；不能把局部当全文。
- 组合到测试用例时保留 reportId/revision、原始标题、Q/建议、证据和未确认项，不把待确认预期当事实。
- 失败时知道哪些文件完成、哪些未验证或未尝试，以及下一步需确认什么。
- 结论、图表、事项数量一致，业务确认、文件写入与功能验证不混淆。

不得为评测向外上传真实例子，也不得把真实业务材料加入公开示例或技能包；不声称这些改动已提升平台评分。
