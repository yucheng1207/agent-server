/**
 * Agent 服务端类型（与 agent-demo 对齐）
 */

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallResult[];
  reasoning?: string[];
}

export interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  duration: number;
  success: boolean;
  error?: string;
}

export interface SessionContext {
  userId?: string;
  orderId?: string;
  [key: string]: unknown;
}

export interface ChatRequest {
  messages: Array<{ role: MessageRole; content: string }>;
  sessionId?: string;
  context?: SessionContext;
}

// 以下供 tools 使用（与 agent-demo types 对齐）
export interface LogEntry {
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  service: string;
  message: string;
  orderId?: string;
  userId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemStatus {
  service: string;
  status: "healthy" | "degraded" | "down";
  latency: number;
  lastChecked: Date;
  details?: string;
}

export interface PaymentChannel {
  channelId: string;
  name: string;
  status: "active" | "inactive" | "maintenance";
  supportedMethods: string[];
  successRate: number;
  avgLatency: number;
}

export interface TroubleshootRule {
  ruleId: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  solution: string;
  priority: number;
}

export interface RuleCondition {
  field: string;
  operator: "equals" | "contains" | "gt" | "lt" | "regex";
  value: string | number;
}
