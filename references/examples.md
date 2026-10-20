# 数据契约、虚构示例与验收

本文件中的会议室预约为完全虚构材料，不来自用户需求或同事反馈。两个完整数据和可打开页面位于 HTML 模板；示例由 `scripts/build-review.js` 的 demo 函数生成，避免文档另抄一套数字再次失配。

## 1. 使用路径（执行者，不要求使用者写代码）

1. 按 8 项/12 维审查原文，确认当前目标。
2. 维护 schemaVersion=2 的统一数据；所有判断必须有原文或确认依据。
3. 用 `scripts/review-core.js` 的 compute 校验及计算。
4. 调用 `scripts/build-review.js` 按 format 生成所需文件，默认 Markdown 和 HTML；不是让用户手填 JSON。
5. 回填后复筛相关维度，从同一更新数据重生成，不直接改渲染结果。

命令示意（在宿主环境用实际可用 Node 的绝对路径替换 node；无需安装包）：

```bash
node scripts/test-review.js
node scripts/build-review.js data.json /existing/output/review-r2
node scripts/build-review.js data.json /existing/output/review-r3 --format md
node scripts/build-review.js data.json /existing/output/review-r4 --no-html
node scripts/build-review.js --demo /existing/output
```

输出目录必须预先存在；已有同名文件拒绝覆盖。默认输出 .md 和 .html，--format md/html 或 --no-html 可仅输出一种；生成参数优先于 DATA.format。Markdown 末尾含 review-data-v2 注释，保存安全序列化的完整 DATA，便于仅交付 Markdown 后继续回填；不得把不该交付的信息藏在注释中。可见正文也保留关联检查项编号。`--templates` 仅用于维护技能内置模板，不是日常审查或回填命令。

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
| materials | 完整材料数组：name/source/version/state/role；state 为已读全文/部分读取/读取失败 |
| checks | 严格按原顺序的 8 或 12 项，见下表 |
| findings | 完整事项数组；无事项用 []，关闭事项仍保留 |
| changes | 可选，本轮具体改动说明数组 |
| summary | 可选，二级整体判断，只引用已读事实 |
| acceptanceEvidence | 可选，二级六类验收证据提示数组 |

不允许手填 rate/score/index/level/verdict/priorities/counts；旧版 items/dims/todos 必须映射为 checks/findings。旧数据缺确认对象或证据时先补信息，不能凭旧分数猜原文。

### 检查项 checks

- id：固定顺序 1..8 / 1..12；name：与原标准名称完全一致。
- status：一级四档，二级五档；不手填 value，分值按状态计算。
- evidence：原文位置、已确认依据或不适用原因，必填。
- advice：可选，业务化的补充方向；无缺口可空。
- label / short：可选，显示用译名/短名，不能替代规范 name 与 id。

非已明确项必须关联未关闭事项；已明确和不适用项不得关联未关闭事项。二级 P0 对应未明确，P1 对应部分明确（完全未描述可未明确），仅 P2/P3 对应基本明确（完全未描述可未明确）。语义判断由执行者按证据完成，脚本只拦截结构矛盾。

### 完整事项 findings

| 字段 | 内容 |
|---|---|
| id | 一级 Q1/Q2…；二级 建议 001/建议 002…，稳定不重编号 |
| title | 原始事项标题；改说明时不擅改追溯基线 |
| priority | 一级 P0/P1/P2；二级可含 P3 |
| type / evidence / fact / advice / testImpact / owner | 对应建议类型、依据位置、材料事实、建议调整、测试影响、确认对象；两级均保留 |
| location | 实际建议补充章节与原文锚点；未知如实说明，不能生成虚假页码 |
| affected | 关联检查项 id 数组，非空、无重复 |
| impact | product 的开放 P0 必填 fill_rule / rework / cannot_close |
| business / technical | 分别记录业务结果与实现确认，见下 |
| document | status 为未写入/正文已生成/已写入；生成、写入须 evidence |
| verification | status 为未验证/已验证；已验证须实际 evidence |
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

## 6. 验收与回归

自动回归由 `scripts/test-review.js` 执行，覆盖同源计算、P0/P1、产品分支、未取整阈值、全不适用、缺字段/非法状态、重复编号、确认来源、部分确认、写入/验证证据、首屏上限、安全文本及双输出一致。

真实试用不由脚本替代。给同事脱敏材料，逐项确认：
- 不需要作者解释，也能说出问题在问什么。
- 能直接答业务结果，知道实现问题该转给研发。
- 只回一个事项时只更新受影响部分，不凭空关闭其它事项。
- 生成的补充正文可放到实际章节，未确认内容未混入。
- 只有授权后写副本，原件不被悄悄覆盖。
- 结论/图表/事项数量一致，业务确认与功能验证不会混淆。

不得为了评测把真实业务材料加入公开示例或技能包。
