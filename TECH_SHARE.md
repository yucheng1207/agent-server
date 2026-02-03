# 排障助手 · 方案说明

> 本文档说明当前实现的**解决方案**：要解决的问题、意图的作用与运行机制、具体实现、关键能力与典型场景。

---

## 一、要解决的问题

支付相关客诉或排障时，经常需要快速回答：

- 订单**下发了哪些支付方式**？用户实际用了哪些？
- **用户是否提交过支付**？用了哪些支付方式、验证项、优惠？结果成功还是失败？失败时给用户的提示是什么？
- 订单**创单日志**、**支付提交接口**调用情况？
- 用户**是否进入收银台、是否点击提交**等前端行为？

这些信息分散在支付链路、BAT 日志、前端埋点等多处，人工排查需要切多个系统、对时间对订单，效率低且容易遗漏。

---

## 二、整体思路

用一个**排障助手 Agent**：用户只需提供**订单号**（及可选上下文），由助手自动决定查哪些数据、按什么顺序查，并给出结构化结论。

- **固定套路的问题**（如「下发了哪些支付方式」「支付提交详情」）走**预设意图 + 工具链**：先调谁、后调谁、参数从哪来都事先配置好，结果稳定、可解释。
- **开放问题**（无法归入任一预设意图）走**通用 ReAct**：由大模型自主选工具、多轮调用。
- **不向用户索要** pageTraceId、payToken、时间等，均由助手通过 payment_trace 等工具从订单号推导（或从历史消息复用）。
- **输出**：全程流式返回（思考、工具调用、工具结果、最终回复）。

---

## 三、意图的作用

### 为什么需要意图

- 很多排障问题是**固定套路**：例如「订单下发了哪些支付方式」必须**先** payment_trace 拿 pageTraceId 和时间，**再**用 pageTraceId 查 routing 日志；「支付提交详情」必须**先** payment_trace **再** pay_submit_flow。顺序和参数来源一旦错，结果就错。
- 若完全交给大模型自由选工具，容易出现顺序错、漏调、参数传错（如用订单号查 payment）。**意图**把「这类问题 → 固定工具链 + 固定参数来源」写死，保证这类问题一定按正确顺序、用正确参数执行。

### 意图包含什么

每个意图在配置里包含：

| 配置项 | 作用 |
|--------|------|
| **id / name** | 意图唯一标识与展示名 |
| **keywords** | 用户问题里只要**包含**其中任一关键词，就认为命中该意图（当前是包含匹配，可扩展正则或相似度） |
| **toolSequence** | 工具链：按顺序执行的工具列表，每步有 `tool` 名称和 `params`（可含占位符如 `{{orderId}}`、`{{pageTraceId}}`、`{{fromDate}}`、`{{toDate}}`） |
| **paramFromContext** | 哪些参数从「上下文」里取（如 orderId）；若未在 context 里，会尝试从用户消息里正则提取订单号（14～20 位数字） |
| **stepResultParsers** | 上一步工具返回的**解析器**：例如 `payment_trace` 对应 `payment_trace_summary`，从 payment_trace 的返回文本里解析出 `pageTraceId`、`fromDate`、`toDate` 等，合并进「已解析参数」，供下一步替换 `{{pageTraceId}}`、`{{fromDate}}` 等 |
| **answerInstruction** | 工具链全部执行完后，给大模型的**回答指引**：如何把各步工具结果组织成自然语言（例如先说什么、后说什么、不要编造、某条无数据怎么说） |

### 意图如何匹配

1. 取**当前用户问题**（最后一条用户消息）和**上下文**（如 session 里带的 orderId）。
2. 按配置顺序遍历所有意图；对每个意图检查用户问题是否**包含**其任一词。
3. 若包含，再检查该意图需要的参数（如 orderId）：若 `paramFromContext` 里有 orderId，则从 context 或用户消息里解析；若工具链里需要 orderId 但解析不到，则**不命中**该意图，继续下一个。
4. 返回**第一个**命中的意图及其已解析参数（如 `{ orderId: "xxx" }`）；若无一命中则返回 null，走 ReAct。

---

## 四、运行机制

### 请求进来后发生了什么

1. **构造输入**  
   根据 sessionId 取最近若干条历史消息，加上当前用户输入，拼成 `messages`；若有 context（如订单号）一并传入。系统提示（含工具能力、使用顺序、禁止向用户要 pageTraceId 等）单独注入。

2. **进入 LangGraph 意图图**  
   用 `messages` 和 `context` 构造图状态，流式执行图。整体流程如下：

   ```mermaid
   flowchart TD
       A[START] --> B[classifyIntent<br/>matchIntent]
       B --> C{intentMatch?}
       C -->|命中| D[runIntentChain<br/>按 toolSequence 执行工具链]
       D --> E[summarizeIntent<br/>LLM 按 answerInstruction 总结]
       E --> F[END]
       C -->|未命中| G[noIntent]
       G --> F
   ```

   **runIntentChain 内部**（按顺序执行工具链，每步参数由上一步解析结果填充）：

   ```mermaid
   flowchart LR
       subgraph runIntentChain["runIntentChain"]
           R[resolved = resolvedParams] --> S[第1步: resolveParams → 调工具 → 解析器更新 resolved]
           S --> T[第2步: resolveParams → 调工具 → ...]
           T --> U[toolResults 汇总]
       end
   ```

   - **classifyIntent**：取最后一条用户消息和 context，调用 `matchIntent(question, context)`；结果写入状态 `intentMatch`（命中则为 `{ intent, resolvedParams }`，未命中为 null）。
   - **条件边**：`intentMatch != null` → runIntentChain → summarizeIntent → END；`intentMatch == null` → noIntent → END。
   - **runIntentChain**：从 `intentMatch` 取意图配置和初始 `resolvedParams`；按 `toolSequence` 每步：用 `resolved` 替换 params 占位符 → 调工具 → 若有 stepResultParsers 则解析结果合并进 `resolved` → 写入 `toolResults`；全部完成后进入 summarizeIntent。
   - **summarizeIntent**：用 `answerInstruction` 和 `toolResults` 拼 system + user，调 LLM 生成 `finalReply`，图结束。

3. **未命中意图时（noIntent）**  
   图中 noIntent 节点不执行逻辑，图直接结束。Agent 层检测到无 `intentMatch` 且无 `finalReply` 时，用 **createReactAgent** 对同一批 `messages` 做流式 ReAct：由模型自己决定调用哪些工具、调用几次，直到得出结论。

4. **流式输出**  
   无论走意图链还是 ReAct，都会按「步骤」产出 chunk 推给前端：例如思考过程、某次工具调用、某次工具结果、最终文本、结束标记。前端按 chunk 类型展示思考、工具调用、结果与回复。

### 小结：两种路径

| 路径 | 触发条件 | 执行内容 | 最终回复来源 |
|------|----------|----------|--------------|
| **意图链** | 用户问题命中某意图，且能解析出所需参数（如 orderId） | 按该意图的 toolSequence 依次调工具，解析器填充下一步参数，最后按 answerInstruction 总结 | summarizeIntent 节点调用 LLM 生成 finalReply |
| **ReAct** | 未命中任何意图（或命中但图未产出 finalReply） | Agent 层用 createReactAgent 流式执行，模型自主选工具、多轮调用 | ReAct 最后一轮模型输出 |

---

## 五、关键能力

### 1. 支付链路追踪（payment_trace）

- 用订单号查该订单的支付链路数据，得到 **pageTraceId**、订单时间范围、事件列表等。
- 后续「支付提交详情」「下发支付方式」「创单日志」「前端埋点」等都依赖这一步（或历史中已有结果）拿到 pageTraceId / payToken。

### 2. 支付提交流程（pay_submit_flow）

- 用 **pageTraceId** 查支付提交流程（queryTraceNodeInfo），得到：支付方式、优惠、验证项、风控、返回 code/返回 message、通道、BAT 链接等。
- 典型用法：用户问「支付提交详情」「用户是否支付提交过」或需核实「支付点击动作、验证项」时，意图链为 **payment_trace → pay_submit_flow**。

### 3. 订单下发的支付方式（routing 日志）

- 用 **pageTraceId + 时间范围** 查 routing 日志，得到按 payToken 汇总的**下发的支付方式**（自有/三方、默认选中、折叠等）。
- 注意：payment_trace / pay_submit_flow 里是用户**实际使用的**；回答「收银台下发了哪些」必须查 routing。

### 4. 创单日志、支付提交接口日志、前端埋点

- 创单：订单号 + 时间；支付提交接口：**payToken** + 时间（禁止订单号）；前端埋点：pageTraceId + 时间。参数与顺序在系统提示中约定。

---

## 六、典型场景与流程

| 用户问题类型 | 意图 | 工具链 | 回答依据 |
|-------------|------|--------|----------|
| 订单下发了哪些支付方式 / 收银台有哪些支付方式 | 查询订单下发的支付方式 | payment_trace → interface_log_query(routing) | routing 的 paymentMethodsByPayToken |
| 支付提交详情 / 用户是否支付提交过 / 用了哪些支付方式、验证项、优惠 | 查询支付提交详情 | payment_trace → pay_submit_flow | pay_submit_flow 的流程节点与返回 code/message |
| 创单日志 / 创单记录 | 查询创单日志 | payment_trace → interface_log_query(creation) | 创单相关日志汇总 |
| 其他开放问题 | 无预设意图 | ReAct（先 payment_trace 若需要，再按需调其他工具） | 模型根据多轮工具结果总结 |

---

*文档与实现同步；重大变更时可在此注明日期或版本。*
