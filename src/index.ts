/**
 * npm 包入口：供外部调用 Agent
 * 使用方式：import { streamAgent } from 'redsea-agent-server';
 */

export { streamAgent, type AgentStreamChunk } from "./agent.js";
export type {
  SessionContext,
  ChatMessage,
  ChatRequest,
  ToolCallResult,
  MessageRole,
} from "./types.js";
