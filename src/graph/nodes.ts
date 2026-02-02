/**
 * LangGraph 节点：意图分类、意图链执行、总结、通用 Agent
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { matchIntent } from "../intents/index.js";
import { getStepResultParser } from "../intents/parsers.js";
import type { GraphState } from "./state.js";

const PLACEHOLDER_REG = /\{\{(\w+)\}\}/g;

function resolveParams(
  params: Record<string, string | number | boolean>,
  resolved: Record<string, string>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== "string") {
      out[k] = v;
      continue;
    }
    const replaced = v.replace(PLACEHOLDER_REG, (_, key) => resolved[key] ?? "");
    out[k] = replaced;
  }
  return out;
}

export type NodeConfig = {
  tools: StructuredToolInterface[];
  /** 用于 summarizeIntent：invoke(messages) 返回 content 字符串 */
  llm: { invoke: (messages: BaseMessage[]) => Promise<{ content?: string }> };
  systemPrompt: string;
  /** 通用 ReAct Agent（无意图命中时调用） */
  reactAgent?: { invoke: (input: { messages: BaseMessage[] }) => Promise<{ messages: BaseMessage[] }> };
};

/** 从 LangGraph 传入的 options 中取出 configurable（NodeConfig），类型兼容 Runtime */
function getNodeConfig(options?: unknown): NodeConfig | undefined {
  return (options as { configurable?: NodeConfig } | undefined)?.configurable;
}

/** 意图分类：根据用户问题与 context 匹配意图 */
export function classifyIntentNode(state: GraphState, options?: unknown): Partial<GraphState> {
  const lastMsg = state.messages[state.messages.length - 1];
  const question = typeof lastMsg?.content === "string" ? lastMsg.content : "";
  const context = state.context as Record<string, unknown>;
  const match = matchIntent(question, context);
  return { intentMatch: match };
}

/** 执行意图链：按 toolSequence 依次调用工具，解析上一步结果填充下一步参数 */
export async function runIntentChainNode(
  state: GraphState,
  options?: unknown
): Promise<Partial<GraphState>> {
  const cfg = getNodeConfig(options);
  const match = state.intentMatch;
  const toolList = cfg?.tools;
  if (!match || !toolList?.length) return {};

  const toolMap = new Map(toolList.map((t) => [t.name, t]));
  const intent = match.intent;
  const results: GraphState["toolResults"] = [];
  let resolved = { ...match.resolvedParams };

  for (const step of intent.toolSequence) {
    const tool = toolMap.get(step.tool);
    if (!tool) continue;

    const input = resolveParams(step.params as Record<string, string>, resolved) as Record<string, unknown>;
    const raw = await tool.invoke(input);
    const resultStr = typeof raw === "string" ? raw : JSON.stringify(raw);
    results.push({ tool: step.tool, input, result: resultStr });

    const parserName = intent.stepResultParsers?.[step.tool];
    if (parserName) {
      const parser = getStepResultParser(parserName);
      if (parser) {
        const parsed = parser(resultStr);
        resolved = { ...resolved, ...parsed };
      }
    }
  }

  return { toolResults: results };
}

/** 意图链总结：用 LLM 根据 answerInstruction 与 toolResults 生成最终回复 */
export async function summarizeIntentNode(
  state: GraphState,
  options?: unknown
): Promise<Partial<GraphState>> {
  const cfg = getNodeConfig(options);
  const match = state.intentMatch;
  const llm = cfg?.llm;
  if (!match || !llm || !state.toolResults.length) return {};

  const instruction = match.intent.answerInstruction;
  const resultsSummary = state.toolResults
    .map((r) => `【${r.tool}】\n${r.result.slice(0, 8000)}`)
    .join("\n\n");

  const systemPrompt =
    (cfg?.systemPrompt ?? "") +
    `\n\n当前意图：${match.intent.name}。请严格按以下指引组织回答，仅基于下方工具结果，不要编造。\n指引：${instruction}`;

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(`请根据以下工具返回结果，按指引总结并回答用户问题。\n\n${resultsSummary}`),
  ];

  const response = await llm.invoke(messages);
  const raw = response?.content;
  const content = typeof raw === "string" ? raw : Array.isArray(raw) ? "" : String(raw ?? "");
  return { finalReply: content };
}

/** 无意图占位节点：不在此执行 ReAct，由 agent 层用 reactAgent.stream() 流式执行 */
export function noIntentNode(_state: GraphState, _options?: unknown): Partial<GraphState> {
  return {};
}
