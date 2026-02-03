# 排障 Agent 服务端

**技术分享与实现细节**：见根目录 [TECH_SHARE.md](./TECH_SHARE.md)。架构或核心逻辑变更时请同步更新该文档。

redsea 的 AI 聊天页（`redsea/src/pages/aiChat.tsx`）与 agent-demo **功能一致**：仅调用本 agent-server 的流式接口，展示思考过程、工具调用与结论。前端逻辑维护在 `redsea/src/ai`，通过 `callAgentStream` 请求本服务。

本目录位于 `ai-project/agent-server`，基于 LangChain/LangGraph + MCP，与 agent-demo 逻辑对齐；默认地址 `http://localhost:3002/api/chat`，可由 redsea 的 `REACT_APP_AGENT_STREAM_URL` 或 URL 参数 `agentStreamUrl` 覆盖。

## 能力

- **LangChain Agent**：ReAct 推理与工具调用（`createReactAgent`）
- **MCP**：`payment_trace` 通过 HTTP JSON-RPC 调用 MCP 服务获取支付链路数据
- **全部工具**（与 agent-demo 对齐）：
  - **payment_trace** - 支付链路追踪（MCP）
  - **order_query** - 订单基础信息查询
  - **bat_query** - BAT 日志查询（rpc_bff 代理）
  - **interface_log_query** - 创单/路由/支付接口日志查询
  - **frontend_log_query** - 前端埋点查询
  - **frontend_log_rules** - 前端埋点规则
  - **log_analysis** - 日志分析
  - **system_status** - 系统状态检查
  - **pay_channel** - 支付渠道查询
  - **rule_engine** - 规则引擎（错误码匹配排障规则）
- **流式输出**：SSE 格式与 agent-demo 一致（`thinking` | `tool_call` | `tool_result` | `text` | `done`）

## 环境变量（支持 .env / .env.local）

变量名与 **agent-demo** 的 `.env.local` 一致，可直接把 `agent-demo/payment-troubleshoot-agent/.env.local` 复制到本目录为 `.env.local` 使用。

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口，默认 3002 |
| `LLM_PROVIDER` | openai / deepseek / qwen / custom |
| `LLM_API_KEY` / `OPENAI_API_KEY` | API Key |
| `LLM_BASE_URL` | 可选，兼容 OpenAI 的 Base URL |
| `LLM_MODEL` | 模型名 |
| `MCP_SERVER_URL` | MCP 服务地址（payment_trace） |
| `RPC_BFF_URL` | BAT 查询等使用的 BFF 地址 |
| `FRONTEND_LOG_API` | 前端埋点查询 API 地址 |
| `FRONTEND_LOG_COOKIE` | 前端埋点 API 认证（如需） |

根目录下可放置 `.env` 或 `.env.local`（后者优先），参考 `.env.example`。

## 本地运行

```bash
cd ai-project/agent-server
npm install
# 方式一：复制 agent-demo 的 .env.local 到本目录
cp ../agent-demo/payment-troubleshoot-agent/.env.local .env.local
# 方式二：或自行创建 .env / .env.local，至少设置 LLM_API_KEY 或 OPENAI_API_KEY
npm run build
npm start
```

启动后可用 `curl http://localhost:3002/health` 确认服务正常；若返回 `{"status":"ok"}` 说明服务在跑。

## 请求失败排查

- **连接被拒绝 / Connection refused**：说明 agent-server 未启动或端口不对。请在本机执行 `npm start`，默认端口 3002。
- **CORS 报错**：已启用 `cors({ origin: true })`，一般无需再配。若仍报错，检查请求是否来自浏览器且 Origin 与 Referer 一致。
- **500 或流中断**：多为 LLM 配置问题。请设置 `OPENAI_API_KEY` 或 `LLM_API_KEY`（以及可选 `LLM_BASE_URL`、`LLM_MODEL`）后重启服务。启动时未设置会打 log 提示。

## 接口

- **POST /api/chat**  
  请求体与 agent-demo 一致：

  ```json
  {
    "messages": [{"role": "user", "content": "订单 123 的支付链路"}],
    "sessionId": "可选",
    "context": { "orderId": "123" }
  }
  ```

  响应：`Content-Type: text/event-stream`，每行 `data: <JSON>`，类型为 `thinking` | `tool_call` | `tool_result` | `text` | `done`。

- **GET /health**  
  健康检查。

## 部署到 BFF

将本目录下的 `src/` 与依赖集成到现有 BFF（如 pay-front-ai-services-function），新增 RPC path 或 HTTP 路由，内部调用 `streamAgent` 并将迭代结果以 SSE 形式返回。redsea 前端配置 `agentStreamUrl` 指向该接口即可。

## 与 redsea 前端配合

redsea 已移除原有「直接调用大模型」的聊天逻辑，仅通过 `redsea/src/ai/agent/agentStreamClient.ts` 的 `callAgentStream` 调用本服务（或 BFF 代理），解析 SSE（thinking / tool_call / tool_result / text / done / error）并展示思考过程、工具调用与结论，与 agent-demo 一致。
