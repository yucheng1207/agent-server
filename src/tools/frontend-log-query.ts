/**
 * 前端埋点查询工具（与 agent-demo 对齐）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { FRONTEND_LOG_API, FRONTEND_LOG_COOKIE } from "../config.js";
import { getLogRule, evaluateScenario, LOG_RULES, SCENARIO_RULES } from "../rules/frontend-log-rules.js";

export interface FrontendLogEntry {
  key: string;
  desc?: string;
  logTime?: string;
  [k: string]: unknown;
}

export interface FrontendLogQueryResult {
  success: boolean;
  pageTraceId: string;
  timeRange: { start: string; end: string };
  totalCount: number;
  keys: string[];
  logs: FrontendLogEntry[];
  recognized: Array<{ key: string; description: string; isSuccess?: boolean; isFailure?: boolean; platform?: string }>;
  scenarioResults?: Array<{ scenarioName: string; success: boolean; conclusion: string }>;
  error?: string;
}

function parseLogItem(item: unknown): FrontendLogEntry | null {
  const o = typeof item === "string" ? (() => { try { return JSON.parse(item); } catch { return null; } })() : (item as Record<string, unknown>);
  if (!o || typeof o !== "object") return null;
  const key = (o.devOriKey as string) || (o.chainName as string) || "";
  if (!key) return null;
  return {
    key,
    desc: o.desc as string | undefined,
    logTime: (o.logTime as string) || (o.ts as string) as string | undefined,
    ...o,
  };
}

function parseFrontendLogResponse(data: unknown): FrontendLogEntry[] {
  const logs: FrontendLogEntry[] = [];
  try {
    const d = (data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (!d) return logs;
    const arr = (d.customData ?? d.logs ?? d.result) as unknown[] | undefined;
    if (Array.isArray(arr)) arr.forEach((item) => { const e = parseLogItem(item); if (e) logs.push(e); });
  } catch (e) {
    console.error("parse frontend log error", e);
  }
  return logs;
}

function analyzeLogs(logs: FrontendLogEntry[]): FrontendLogQueryResult["recognized"] {
  const recognized: FrontendLogQueryResult["recognized"] = [];
  const seen = new Set<string>();
  const uniqueKeys = [...new Set(logs.map((l) => l.key))];
  for (const key of uniqueKeys) {
    if (seen.has(key)) continue;
    const rule = getLogRule(key);
    if (rule) {
      seen.add(key);
      recognized.push({
        key: rule.key,
        description: rule.description,
        isSuccess: rule.isSuccess,
        isFailure: rule.isFailure,
        platform: rule.platform,
      });
    }
  }
  return recognized;
}

function evaluateAllScenarios(keys: string[]): FrontendLogQueryResult["scenarioResults"] {
  return SCENARIO_RULES.map((s) => {
    const r = evaluateScenario(keys, s);
    return { scenarioName: s.name, success: r.success, conclusion: r.conclusion };
  });
}

export async function queryFrontendLogs(pageTraceId: string, startDate: string, endDate: string): Promise<FrontendLogQueryResult> {
  const result: FrontendLogQueryResult = {
    success: false,
    pageTraceId,
    timeRange: { start: startDate, end: endDate },
    totalCount: 0,
    keys: [],
    logs: [],
    recognized: [],
  };
  try {
    const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    let res: Response;
    try {
      res = await fetch(FRONTEND_LOG_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: FRONTEND_LOG_COOKIE,
          Origin: "https://ptrace.ctripcorp.com",
          Referer: "https://ptrace.ctripcorp.com/",
        },
        body: JSON.stringify({
          timeout: 0,
          pageTraceId,
          startDate,
          endDate,
          head: { cid: "09031055410757412606", ctok: "", cver: "1.0", lang: "01", sid: "8888", syscode: "09", auth: "", xsid: "", extension: [] },
        }),
      });
    } finally {
      if (originalTls !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls;
      else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
    if (!res.ok) {
      result.error = `HTTP ${res.status}`;
      return result;
    }
    const json = await res.json();
    if ((json as Record<string, unknown>).returncode === -100 || (json as Record<string, unknown>).message === "not login") {
      result.error = "API 认证失败：需要登录或配置 FRONTEND_LOG_COOKIE";
      return result;
    }
    const logs = parseFrontendLogResponse(json);
    const keys = [...new Set(logs.map((l) => l.key))];
    result.success = true;
    result.totalCount = logs.length;
    result.keys = keys;
    result.logs = logs;
    result.recognized = analyzeLogs(logs);
    result.scenarioResults = evaluateAllScenarios(keys);
  } catch (e) {
    result.error = e instanceof Error ? e.message : "未知错误";
  }
  return result;
}

export const frontendLogQueryTool = tool(
  async ({ pageTraceId, startDate, endDate }) => {
    if (!pageTraceId) return JSON.stringify({ success: false, error: "请提供 pageTraceId" }, null, 2);
    if (!startDate || !endDate) return JSON.stringify({ success: false, error: "请提供时间范围 startDate 和 endDate，格式：YYYY-MM-DD HH:mm:ss.SSS" }, null, 2);
    const result = await queryFrontendLogs(pageTraceId, startDate, endDate);
    return JSON.stringify(result, null, 2);
  },
  {
    name: "frontend_log_query",
    description:
      "查询前端埋点数据。根据 pageTraceId 和时间范围查询用户在支付流程中的前端埋点记录。返回埋点列表、业务含义分析及常见业务场景判断（如是否进入收银台、是否提交支付等）。需先有 payment_trace 获取 pageTraceId 与时间范围。",
    schema: z.object({
      pageTraceId: z.string().describe("页面追踪ID，用于关联用户的访问链路"),
      startDate: z.string().describe("查询开始时间，格式：YYYY-MM-DD HH:mm:ss.SSS"),
      endDate: z.string().describe("查询结束时间，格式：YYYY-MM-DD HH:mm:ss.SSS"),
    }),
  }
);

export const frontendLogRulesTool = tool(
  async () => {
    const rules = {
      logRules: LOG_RULES.map((r) => ({ key: r.key, description: r.description, category: r.category, isSuccess: r.isSuccess, isFailure: r.isFailure, platform: r.platform })),
      scenarioRules: SCENARIO_RULES.map((s) => ({ id: s.id, name: s.name, description: s.description, keywords: s.keywords, conditions: s.conditions.map((c) => ({ type: c.type, keys: c.keys, description: c.description })) })),
    };
    return JSON.stringify(rules, null, 2);
  },
  {
    name: "frontend_log_rules",
    description: "获取前端埋点的业务规则定义。包括各埋点 key 的业务含义，以及如何通过埋点组合判断业务场景（如是否进入收银台成功）。",
    schema: z.object({}),
  }
);
