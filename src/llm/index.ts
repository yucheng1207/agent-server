/**
 * LLM 工厂（与 agent-demo 对齐）
 */

import { ChatOpenAI } from "@langchain/openai";
import type { LLMConfig } from "../config.js";

export function createLLM(config: LLMConfig): ChatOpenAI {
  return new ChatOpenAI({
    openAIApiKey: config.apiKey,
    modelName: config.model,
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });
}
