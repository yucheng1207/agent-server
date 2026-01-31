/**
 * Agent 核心（与 agent-demo 对齐：LangGraph ReAct Agent + 流式）
 */

import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { getConfig } from "./config.js";
import { createLLM } from "./llm/index.js";
import { tools, toolNameMap } from "./tools/index.js";
import { getSystemPromptWithContext } from "./prompts.js";
import {
  getSessionMessages,
  addMessageToSession,
  createSession,
  convertToLangChainMessages,
  getRecentMessages,
} from "./memory.js";
import type { ChatMessage, SessionContext, ToolCallResult } from "./types.js";

let agentInstance: ReturnType<typeof createReactAgent> | null = null;

function getAgent(llm?: ChatOpenAI) {
  if (!agentInstance || llm) {
    const model = llm || createLLM(getConfig().llm);
    agentInstance = createReactAgent({ llm: model, tools });
  }
  return agentInstance;
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type AgentStreamChunk = {
  type: "thinking" | "tool_call" | "tool_result" | "text" | "done";
  content: string;
  toolName?: string;
};

/**
 * 流式运行 Agent（与 agent-demo streamAgent 对齐）
 */
export async function* streamAgent(
  input: string,
  sessionId?: string,
  context?: SessionContext
): AsyncGenerator<AgentStreamChunk> {
  const sid = sessionId || generateId();
  createSession(sid);

  const systemPrompt = getSystemPromptWithContext(context as Record<string, string>);
  const historyMessages = getRecentMessages(sid, 10);
  const langchainHistory = convertToLangChainMessages(historyMessages);
  const initialMessageCount = 1 + langchainHistory.length + 1;

  const userMessage: ChatMessage = {
    id: generateId(),
    role: "user",
    content: input,
    timestamp: new Date(),
  };
  addMessageToSession(sid, userMessage);

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...langchainHistory,
    new HumanMessage(input),
  ];

  const agent = getAgent();
  const stream = await agent.stream({ messages }, { streamMode: "values" });

  let finalReply = "";
  const toolCalls: ToolCallResult[] = [];
  const reasoning: string[] = [];
  const processedMessageIds = new Set<string>();
  let stepCount = 0;

  for await (const chunk of stream) {
    const newMessages = (chunk as { messages: BaseMessage[] }).messages.slice(initialMessageCount);

    for (const msg of newMessages) {
      const msgId = (msg as unknown as { id?: string }).id || `msg-${newMessages.indexOf(msg)}`;
      if (processedMessageIds.has(msgId)) continue;

      if ((msg as { _getType?: () => string })._getType?.() === "ai") {
        const aiMsg = msg as AIMessage & { tool_calls?: Array<{ name: string; args: Record<string, unknown> }> };
        if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
          stepCount++;
          if (typeof aiMsg.content === "string" && aiMsg.content.trim()) {
            yield { type: "thinking", content: `💭 思考 #${stepCount}: ${aiMsg.content}` };
            reasoning.push(`思考: ${aiMsg.content}`);
          }
          for (const toolCall of aiMsg.tool_calls) {
            const displayName = toolNameMap[toolCall.name] || toolCall.name;
            yield { type: "thinking", content: `🔧 决策: 调用 ${displayName}` };
            yield {
              type: "tool_call",
              content: `正在调用 ${displayName}...\n参数: ${JSON.stringify(toolCall.args, null, 2)}`,
              toolName: toolCall.name,
            };
            reasoning.push(`调用工具: ${displayName}(${JSON.stringify(toolCall.args)})`);
          }
          processedMessageIds.add(msgId);
        } else if (typeof aiMsg.content === "string" && aiMsg.content) {
          finalReply = aiMsg.content;
          yield { type: "text", content: aiMsg.content };
          processedMessageIds.add(msgId);
        }
      }

      if ((msg as { _getType?: () => string })._getType?.() === "tool") {
        const toolMsgId = (msg as unknown as { id?: string }).id || `tool-${newMessages.indexOf(msg)}`;
        if (processedMessageIds.has(toolMsgId)) continue;
        const toolName = (msg as unknown as { name: string }).name;
        const toolContent =
          typeof (msg as { content: unknown }).content === "string"
            ? (msg as { content: string }).content
            : JSON.stringify((msg as { content: unknown }).content);

        toolCalls.push({
          toolName,
          input: {},
          output: toolContent,
          duration: 0,
          success: true,
        });

        yield {
          type: "thinking",
          content: `📥 观察: ${toolNameMap[toolName] || toolName} 返回结果`,
        };
        yield { type: "tool_result", content: toolContent, toolName };
        reasoning.push(`${toolNameMap[toolName] || toolName} 返回结果`);
        processedMessageIds.add(toolMsgId);
      }
    }
  }

  const aiMessage: ChatMessage = {
    id: generateId(),
    role: "assistant",
    content: finalReply,
    timestamp: new Date(),
    toolCalls,
    reasoning,
  };
  addMessageToSession(sid, aiMessage);

  yield { type: "done", content: sid };
}

export { getSessionMessages, clearSession, createSession } from "./memory.js";
