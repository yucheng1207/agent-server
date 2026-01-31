/**
 * BAT 日志查询工具（与 agent-demo 对齐，通过 rpc_bff 代理）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RPC_BFF_URL } from "../config.js";

export interface BatQueryParams {
  appId: number;
  fromDate: number | string;
  toDate: number | string;
  message?: string;
  command?: string;
  tagKey?: string;
  tagValue?: string;
  isPrd?: boolean;
  tags?: string;
}

export interface BatAttribute {
  key: string;
  value: string;
}

export interface BatLogEntry {
  id: string;
  appId: string;
  hostName: string;
  hostIP: string;
  processId: string;
  timestamp: number;
  sequenceNo: string;
  rowKey: string;
  logEventId: string;
  logType: string;
  logLevel: string;
  createdTime: number;
  threadId: string;
  traceId: string;
  messagePrefix: string;
  attributes: BatAttribute[];
  title: string;
  message: string;
  source: string;
  spanId: string;
  timeStr: string;
  region: string;
  parsedMessage?: unknown;
}

export interface BatSearchResult {
  totalSize?: number;
  size?: number;
  lastTimestamp?: number;
  lastScanRowKey?: string;
  hasMoreResult?: boolean;
  logs?: BatLogEntry[];
  useTime?: number;
  catUrl?: string;
  timeout?: boolean;
}

export interface BatQueryResponse {
  status: number;
  url: string;
  params: BatQueryParams;
  raw: string;
  responseTime: number;
  parsed?: BatSearchResult;
  error?: string;
}

/** 从原始 log 对象解析为 BatLogEntry，包含将 message/content/body 解析为 parsedMessage（与 agent-demo 一致，保证 interface_log_query 返回完整 rawMessage） */
function parseLogFromJson(log: Record<string, unknown>): BatLogEntry {
  const msg = String(log.message ?? log.content ?? log.body ?? "");
  const entry: BatLogEntry = {
    id: String(log.id ?? ""),
    appId: String(log.appId ?? ""),
    hostName: String(log.hostName ?? ""),
    hostIP: String(log.hostIP ?? ""),
    processId: String(log.processId ?? ""),
    timestamp: Number(log.timestamp ?? 0),
    sequenceNo: String(log.sequenceNo ?? ""),
    rowKey: String(log.rowKey ?? ""),
    logEventId: String(log.logEventId ?? ""),
    logType: String(log.logType ?? ""),
    logLevel: String(log.logLevel ?? ""),
    createdTime: Number(log.createdTime ?? 0),
    threadId: String(log.threadId ?? ""),
    traceId: String(log.traceId ?? ""),
    messagePrefix: String(log.messagePrefix ?? ""),
    attributes: Array.isArray(log.attributes) ? (log.attributes as BatAttribute[]) : [],
    title: String(log.title ?? ""),
    message: msg,
    source: String(log.source ?? ""),
    spanId: String(log.spanId ?? ""),
    timeStr: String(log.timeStr ?? ""),
    region: String(log.region ?? ""),
  };
  const toParse = msg || String(log.messagePrefix ?? "");
  if (toParse) {
    const trimmed = toParse.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        entry.parsedMessage = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        // 非 JSON 或解析失败，不设置 parsedMessage
      }
    }
  }
  return entry;
}

function parseRpcBffResponse(responseText: string): BatSearchResult {
  const result: BatSearchResult = { logs: [] };
  try {
    const jsonResponse = JSON.parse(responseText);
    if (jsonResponse?.output?.resultJson) {
      const logData = JSON.parse(jsonResponse.output.resultJson);
      result.totalSize = logData.totalSize ?? 0;
      result.size = logData.size ?? 0;
      result.hasMoreResult = logData.hasMoreResult ?? false;
      result.lastTimestamp = logData.lastTimestamp;
      result.lastScanRowKey = logData.lastScanRowKey;
      result.useTime = logData.useTime;
      result.catUrl = logData.catUrl;
      result.timeout = logData.timeout;
      if (logData.logs && Array.isArray(logData.logs)) {
        result.logs = logData.logs.map((log: Record<string, unknown>) => parseLogFromJson(log));
      }
    }
  } catch (e) {
    console.error("BAT parse error:", e);
  }
  return result;
}

export async function queryBat(params: BatQueryParams): Promise<BatQueryResponse> {
  const { appId, fromDate, toDate, message = "", command = "", tagKey = "", tagValue = "", isPrd = true, tags } = params;
  const fromTimestamp = typeof fromDate === "number" ? fromDate : new Date(fromDate).getTime();
  const toTimestamp = typeof toDate === "number" ? toDate : new Date(toDate).getTime();
  let tagsArray: Array<{ key: string; value: string }> = [];
  if (tagKey && tagValue) tagsArray.push({ key: tagKey, value: tagValue });
  if (tags) {
    try {
      const additional = JSON.parse(tags) as Array<{ key: string; value: string }>;
      tagsArray = [...tagsArray, ...additional];
    } catch {}
  }
  const requestBody = {
    type: "Single",
    path: ["queryOsg"],
    input: {
      appId,
      fromDate: fromTimestamp,
      toDate: toTimestamp,
      isPrd,
      message,
      command,
      tagKey,
      tagValue,
      tags: JSON.stringify(tagsArray),
    },
  };
  const startTime = Date.now();
  const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  let response: Response;
  try {
    response = await fetch(RPC_BFF_URL, {
      method: "POST",
      headers: { Accept: "*/*", "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify(requestBody),
    });
  } finally {
    if (originalTls !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls;
    else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }
  const responseTime = Date.now() - startTime;
  const text = await response.text();
  const result: BatQueryResponse = { status: response.status, url: RPC_BFF_URL, params, raw: text, responseTime };
  if (response.ok && text) result.parsed = parseRpcBffResponse(text);
  return result;
}

export const batQueryTool = tool(
  async ({ appId, fromDate, toDate, message, command, tagKey, tagValue, isPrd }) => {
    try {
      const response = await queryBat({
        appId,
        fromDate,
        toDate,
        message,
        command,
        tagKey,
        tagValue,
        isPrd: isPrd ?? true,
      });
      return JSON.stringify({
        success: response.status === 200 && !response.error,
        status: response.status,
        responseTime: response.responseTime,
        error: response.error,
        totalSize: response.parsed?.totalSize ?? 0,
        size: response.parsed?.size ?? response.parsed?.logs?.length ?? 0,
        hasMoreResult: response.parsed?.hasMoreResult ?? false,
        logs: response.parsed?.logs ?? [],
      }, null, 2);
    } catch (e) {
      return JSON.stringify({ success: false, error: e instanceof Error ? e.message : "未知错误" }, null, 2);
    }
  },
  {
    name: "bat_query",
    description:
      "查询 BAT 日志系统中的应用日志。可以根据 AppID、时间范围、命令名、标签等条件进行查询。适用于排查服务调用、业务日志等问题。",
    schema: z.object({
      appId: z.number().describe("应用 ID，如 100020575（兼容层）、100049968（中台）"),
      fromDate: z.string().describe("起始时间，时间戳（毫秒）或 ISO 字符串"),
      toDate: z.string().describe("结束时间，时间戳（毫秒）或 ISO 字符串"),
      message: z.string().optional().describe("消息过滤，如 createPayOrder"),
      command: z.string().optional().describe("命令名过滤"),
      tagKey: z.string().optional().describe("标签键，如 outTradeNo、paytraceid"),
      tagValue: z.string().optional().describe("标签值，如订单号"),
      isPrd: z.boolean().optional().describe("是否生产环境，默认 true"),
    }),
  }
);
