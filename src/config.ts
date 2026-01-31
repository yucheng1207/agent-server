/**
 * Agent 配置（环境变量）
 * 支持 .env / .env.local（与 agent-demo .env.local 变量名一致，可直接复制使用）
 */

import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local" });

export type LLMProvider = "openai" | "deepseek" | "qwen" | "custom";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export function getConfig(): { llm: LLMConfig } {
  const provider = (process.env.LLM_PROVIDER as LLMProvider) || "openai";
  const defaults: Record<LLMProvider, { model: string; baseUrl?: string }> = {
    openai: { model: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
    deepseek: { model: "deepseek-chat", baseUrl: "https://api.deepseek.com" },
    qwen: { model: "qwen-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
    custom: { model: "gpt-3.5-turbo" },
  };
  const d = defaults[provider];
  return {
    llm: {
      provider,
      apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "",
      baseUrl: process.env.LLM_BASE_URL || d.baseUrl,
      model: process.env.LLM_MODEL || d.model,
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.7"),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
    },
  };
}

export const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ||
  "http://workflow-server.hotel.ctripcorp.com/mcp/server/srvoHWKo4Eqy2jVZ/mcp";

export const RPC_BFF_URL =
  process.env.RPC_BFF_URL ||
  "https://pay-front-ai-services-function.fws.faas.qa.nt.ctripcorp.com/rpc_bff";

export const FRONTEND_LOG_API =
  process.env.FRONTEND_LOG_API || "https://ws.fulllink.pay.ctripcorp.com/fullLink/PayFullLinkTrackController/queryFrontLog";
export const FRONTEND_LOG_COOKIE = process.env.FRONTEND_LOG_COOKIE || "";
