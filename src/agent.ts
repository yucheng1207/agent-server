/**
 * Agent 核心：LangGraph 意图路由 + 通用 ReAct 兜底，流式输出
 */

import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getConfig } from "./config.js";
import { createLLM } from "./llm/index.js";
import { tools, toolNameMap } from "./tools/index.js";
import { getSystemPromptWithContext } from "./prompts.js";
import {
  addMessageToSession,
  createSession,
  convertToLangChainMessages,
  getRecentMessages,
} from "./memory.js";
import { createIntentGraph, initialGraphState, type NodeConfig } from "./graph/index.js";
import type { ChatMessage, SessionContext, ToolCallResult } from "./types.js";

/** 包装 LLM 使 invoke 返回 { content: string }，满足 NodeConfig 类型 */
function wrapLLMForGraph(llm: { invoke: (messages: BaseMessage[]) => Promise<{ content?: unknown }> }): NodeConfig["llm"] {
  return {
    invoke: async (messages: BaseMessage[]) => {
      const res = await llm.invoke(messages);
      const raw = res?.content;
      const content = typeof raw === "string" ? raw : Array.isArray(raw) ? "" : String(raw ?? "");
      return { content };
    },
  };
}

let compiledGraph: ReturnType<typeof createIntentGraph> | null = null;
let reactAgentInstance: ReturnType<typeof createReactAgent> | null = null;

function getCompiledGraph() {
  if (!compiledGraph) compiledGraph = createIntentGraph();
  return compiledGraph;
}

function getReactAgent() {
  if (!reactAgentInstance) {
    reactAgentInstance = createReactAgent({ llm: createLLM(getConfig().llm), tools });
  }
  return reactAgentInstance;
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
 * 流式运行：先走 LangGraph 意图图；若命中意图则执行意图链并总结，否则走通用 ReAct，再按序产出 chunk
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

  const initialState = initialGraphState(messages, sid, context ?? {});
  const configurable: NodeConfig = {
    tools,
    llm: wrapLLMForGraph(createLLM(getConfig().llm)),
    systemPrompt,
    reactAgent: getReactAgent(),
  };

  const graph = getCompiledGraph();
  const stream = await graph.stream(initialState, {
    configurable,
    streamMode: "updates",
  });

  // 流式消费：每步完成后立即产出 chunk，并累积状态用于最终落库
  let intentMatch: { intent: { name: string } } | null = null;
  let toolResults: Array<{ tool: string; input: Record<string, unknown>; result: string }> = [];
  let finalReply = "";
  const reasoning: string[] = [];

  for await (const chunk of stream) {
    const update = chunk as Record<string, unknown>;
    if (update.classifyIntent != null) {
      const u = update.classifyIntent as { intentMatch?: { intent: { name: string } } | null };
      intentMatch = u.intentMatch ?? null;
      if (intentMatch) {
        yield { type: "thinking", content: `🔍 识别到意图：${intentMatch.intent.name}` };
        reasoning.push(`识别到意图：${intentMatch.intent.name}`);
      }
    }
    if (update.runIntentChain != null) {
      const u = update.runIntentChain as { toolResults?: typeof toolResults };
      toolResults = u.toolResults ?? [];
      for (const tr of toolResults) {
        const displayName = toolNameMap[tr.tool] || tr.tool;
        yield { type: "thinking", content: `🔧 决策: 调用 ${displayName}` };
        yield {
          type: "tool_call",
          content: `正在调用 ${displayName}...\n参数: ${JSON.stringify(tr.input, null, 2)}`,
          toolName: tr.tool,
        };
        reasoning.push(`调用工具: ${displayName}`);
        yield { type: "thinking", content: `📥 观察: ${displayName} 返回结果` };
        yield { type: "tool_result", content: tr.result, toolName: tr.tool };
        reasoning.push(`${displayName} 返回结果`);
      }
    }
    if (update.summarizeIntent != null) {
      const u = update.summarizeIntent as { finalReply?: string };
      finalReply = u.finalReply ?? "";
      yield { type: "text", content: finalReply };
    }
  }

  // 无意图命中：在 agent 层流式跑 ReAct，按步产出 thinking / tool_call / tool_result / text
  if (!intentMatch && finalReply === "") {
    const reactAgent = getReactAgent();
    const reactStream = await reactAgent.stream({ messages }, { streamMode: "updates" });
    const reactToolCalls: ToolCallResult[] = [];
    for await (const chunk of reactStream) {
      const update = chunk as Record<string, { messages?: BaseMessage[] }>;
      if (update.agent?.messages?.length) {
        for (const m of update.agent.messages) {
          const type = (m as { _getType?: () => string })._getType?.();
          if (type !== "ai") continue;
          const ai = m as { tool_calls?: Array<{ name?: string; args?: unknown; id?: string }>; content?: string };
          if (ai.tool_calls?.length) {
            for (const tc of ai.tool_calls) {
              const name = tc.name ?? "";
              const displayName = toolNameMap[name] || name;
              yield { type: "thinking", content: `🔧 决策: 调用 ${displayName}` };
              yield {
                type: "tool_call",
                content: `正在调用 ${displayName}...\n参数: ${JSON.stringify(tc.args ?? {}, null, 2)}`,
                toolName: name,
              };
              reasoning.push(`调用工具: ${displayName}`);
              reactToolCalls.push({ toolName: name, input: (tc.args as Record<string, unknown>) ?? {}, output: "", duration: 0, success: true });
            }
          }
          if (typeof ai.content === "string" && ai.content.trim()) {
            finalReply = ai.content;
            yield { type: "text", content: ai.content };
          }
        }
      }
      if (update.tools?.messages?.length) {
        for (const m of update.tools.messages) {
          const type = (m as { _getType?: () => string })._getType?.();
          if (type !== "tool") continue;
          const tm = m as { name?: string; content?: string };
          const name = tm.name ?? "";
          const displayName = toolNameMap[name] || name;
          yield { type: "thinking", content: `📥 观察: ${displayName} 返回结果` };
          yield { type: "tool_result", content: typeof tm.content === "string" ? tm.content : JSON.stringify(tm.content ?? ""), toolName: name };
          reasoning.push(`${displayName} 返回结果`);
          for (let i = reactToolCalls.length - 1; i >= 0; i--) {
            if (reactToolCalls[i].toolName === name) {
              reactToolCalls[i].output = typeof tm.content === "string" ? tm.content : JSON.stringify(tm.content ?? "");
              break;
            }
          }
        }
      }
    }
    toolResults = reactToolCalls.map((t) => ({
      tool: t.toolName,
      input: t.input,
      result: typeof t.output === "string" ? t.output : JSON.stringify(t.output ?? ""),
    }));
  }

  const toolCalls: ToolCallResult[] = toolResults.map((tr) => ({
    toolName: tr.tool,
    input: tr.input,
    output: tr.result,
    duration: 0,
    success: true,
  }));

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
