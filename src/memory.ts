/**
 * 对话记忆（与 agent-demo 对齐）
 */

import { HumanMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatMessage } from "./types.js";

const sessions = new Map<string, ChatMessage[]>();

export function getSessionMessages(sessionId: string): ChatMessage[] {
  return sessions.get(sessionId) || [];
}

export function addMessageToSession(sessionId: string, message: ChatMessage): void {
  const messages = sessions.get(sessionId) || [];
  messages.push(message);
  sessions.set(sessionId, messages);
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function createSession(sessionId: string): void {
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
}

export function convertToLangChainMessages(messages: ChatMessage[]): BaseMessage[] {
  return messages.map((msg) =>
    msg.role === "user" ? new HumanMessage(msg.content) : new AIMessage(msg.content)
  );
}

export function getRecentMessages(sessionId: string, limit = 10): ChatMessage[] {
  return getSessionMessages(sessionId).slice(-limit);
}
