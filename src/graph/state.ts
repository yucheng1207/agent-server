/**
 * LangGraph 状态定义
 * 使用 Annotation.Root 以便 StateGraph 正确合并节点返回值
 */

import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { IntentMatch } from "../intents/types.js";
import type { SessionContext } from "../types.js";

export interface GraphState {
  messages: BaseMessage[];
  intentMatch: IntentMatch | null;
  toolResults: Array<{ tool: string; input: Record<string, unknown>; result: string }>;
  finalReply: string;
  sessionId: string;
  context: SessionContext;
}

const GraphStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (_, y) => (y ?? []) as BaseMessage[], default: () => [] }),
  intentMatch: Annotation<IntentMatch | null>({ reducer: (_, y) => y ?? null, default: () => null }),
  toolResults: Annotation<GraphState["toolResults"]>({ reducer: (_, y) => (y ?? []) as GraphState["toolResults"], default: () => [] }),
  finalReply: Annotation<string>({ reducer: (_, y) => (y ?? "") as string, default: () => "" }),
  sessionId: Annotation<string>({ reducer: (_, y) => (y ?? "") as string, default: () => "" }),
  context: Annotation<SessionContext>({ reducer: (_, y) => (y ?? {}) as SessionContext, default: () => ({}) }),
});

export { GraphStateAnnotation };

export const initialGraphState = (
  messages: BaseMessage[],
  sessionId: string,
  context: SessionContext
): Partial<GraphState> => ({
  messages,
  intentMatch: null,
  toolResults: [],
  finalReply: "",
  sessionId,
  context: context ?? {},
});
