/**
 * Agent 流式 HTTP 服务
 * 暴露 POST /api/chat，请求体与 agent-demo 一致，响应为 SSE 流（data: JSON chunk）
 * 配置从 .env / .env.local 加载（见 config.ts），变量名与 agent-demo .env.local 一致
 */

import express from "express";
import cors from "cors";
import { streamAgent } from "./agent.js";
import type { ChatRequest } from "./types.js";

const app = express();
app.use(cors({ origin: true })); // 允许前端跨域（开发时 redsea 不同端口）
app.use(express.json());

const PORT = Number(process.env.PORT) || 3002;

app.post("/api/chat", async (req, res) => {
  const body = req.body as ChatRequest & { content?: string };
  const messages = body.messages;
  const lastContent = Array.isArray(messages) && messages.length
    ? (messages[messages.length - 1] as { role?: string; content?: string })?.content
    : (body as { content?: string }).content;

  const input = typeof lastContent === "string" ? lastContent : "";
  if (!input.trim()) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }

  const sessionId = body.sessionId;
  const context = body.context;

  try {
    let headersSent = false;
    for await (const chunk of streamAgent(input, sessionId, context)) {
      if (!headersSent) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();
        headersSent = true;
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      (res as express.Response & { flush?: () => void }).flush?.();
    }
    if (!headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error("Agent stream error:", e);
    if (!res.headersSent) {
      const msg = e instanceof Error ? e.message : "服务器错误";
      res.status(500).json({ error: msg });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Agent server listening on http://localhost:${PORT}`);
  console.log("POST /api/chat - 流式对话（SSE）");
  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    console.warn("未设置 LLM_API_KEY 或 OPENAI_API_KEY，调用 /api/chat 将可能报错，请配置后重启");
  }
});
