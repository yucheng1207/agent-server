/**
 * 日志分析工具（与 agent-demo 对齐）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { LogEntry } from "../types.js";

const mockLogs: LogEntry[] = [
  { timestamp: new Date("2024-01-15T10:30:00"), level: "info", service: "payment-gateway", message: "收到支付请求", orderId: "ORD-001", userId: "USER-123", traceId: "trace-001" },
  { timestamp: new Date("2024-01-15T10:30:03"), level: "error", service: "payment-gateway", message: "支付宝返回错误: INSUFFICIENT_BALANCE - 账户余额不足", orderId: "ORD-001", traceId: "trace-001", metadata: { errorCode: "INSUFFICIENT_BALANCE" } },
  { timestamp: new Date("2024-01-15T11:00:30"), level: "error", service: "payment-gateway", message: "渠道请求超时: CHANNEL_TIMEOUT", orderId: "ORD-003", traceId: "trace-003", metadata: { errorCode: "CHANNEL_TIMEOUT" } },
];

async function queryLogsByOrderId(orderId: string): Promise<LogEntry[]> {
  await new Promise((r) => setTimeout(r, 50));
  return mockLogs.filter((l) => l.orderId === orderId);
}

async function queryLogsByTimeRange(start: Date, end: Date, level?: string): Promise<LogEntry[]> {
  await new Promise((r) => setTimeout(r, 50));
  return mockLogs.filter((l) => l.timestamp >= start && l.timestamp <= end && (!level || l.level === level));
}

function formatLogEntry(log: LogEntry): string {
  const emoji: Record<string, string> = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" };
  let r = `${emoji[log.level] ?? "📝"} [${log.timestamp.toISOString()}] [${log.service}] ${log.message}`;
  if (log.metadata) r += `\n   详情: ${JSON.stringify(log.metadata)}`;
  return r;
}

function analyzeLogs(logs: LogEntry[]): string {
  if (logs.length === 0) return "未找到相关日志";
  const errors = logs.filter((l) => l.level === "error");
  const warns = logs.filter((l) => l.level === "warn");
  let a = `📊 日志分析结果:\n- 总日志数: ${logs.length}\n- 错误: ${errors.length}\n- 警告: ${warns.length}\n\n📜 详情:\n${logs.map(formatLogEntry).join("\n")}`;
  if (errors.length) a += `\n\n🔴 错误摘要:\n${errors.map((l) => `- ${l.message}`).join("\n")}`;
  return a;
}

export const logAnalysisTool = tool(
  async ({ orderId, startTime, endTime, level }) => {
    try {
      let logs: LogEntry[] = [];
      if (orderId) logs = await queryLogsByOrderId(orderId);
      else if (startTime && endTime) logs = await queryLogsByTimeRange(new Date(startTime), new Date(endTime), level);
      else return "请提供订单号(orderId)或时间范围(startTime, endTime)进行查询";
      return analyzeLogs(logs);
    } catch (e) {
      return `分析日志时发生错误: ${e instanceof Error ? e.message : "未知错误"}`;
    }
  },
  {
    name: "log_analysis",
    description: "分析支付系统日志。可根据订单号或时间范围查询日志，提取错误信息和关键事件。",
    schema: z.object({
      orderId: z.string().optional().describe("订单号，如 ORD-001"),
      startTime: z.string().optional().describe("开始时间，ISO 格式"),
      endTime: z.string().optional().describe("结束时间，ISO 格式"),
      level: z.string().optional().describe("日志级别过滤：debug、info、warn、error"),
    }),
  }
);
