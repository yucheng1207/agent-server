/**
 * 接口日志查询工具（与 agent-demo 对齐，基于 bat-query）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { queryBat, type BatLogEntry } from "./bat-query.js";

export interface InterfaceQueryConfigItem {
  appId: number;
  message?: string;
  command?: string;
  tagKey: string;
  description: string;
  /** 仅当 tagValue 以此后缀结尾时使用该配置（如 PayToken 以 F 结尾用 100054388） */
  tagValueEndsWith?: string;
}

export const INTERFACE_QUERY_CONFIGS: Record<string, InterfaceQueryConfigItem[]> = {
  creation: [
    { appId: 100020575, message: "createPayOrder", command: "", tagKey: "outTradeNo", description: "兼容层创单" },
    { appId: 100049968, message: "createTradeOrder", command: "", tagKey: "outTradeNo", description: "中台创单" },
  ],
  routing: [
    { appId: 100033482, command: "TradeCoreFacade.internalQueryTradeOrder", tagKey: "paytraceid", description: "交易核心查询" },
    { appId: 100033482, command: "paymentListSearch", tagKey: "paytraceid", description: "支付列表搜索" },
  ],
  payment: [
    { appId: 100033783, command: "submitPayment", tagKey: "tradeNo", description: "支付提交" },
    { appId: 100054388, command: "submitPayment", tagKey: "tradeNo", description: "支付提交(PayToken以F结尾)", tagValueEndsWith: "F" },
  ],
};

export interface InterfaceLogInfo {
  logId: string;
  timestamp: number;
  timeStr: string;
  traceId: string;
  serviceName?: string;
  command?: string;
  responseCode?: string;
  responseMessage?: string;
  extractedData?: Record<string, unknown>;
  rawMessage?: Record<string, unknown>;
}

export interface InterfaceLogQueryResult {
  success: boolean;
  queryType: string;
  totalLogs: number;
  results: Array<{ query: string; appId: number; message?: string; command?: string; success: boolean; logCount: number; logs: InterfaceLogInfo[]; error?: string }>;
  /** 与 agent-demo 一致：顶层汇总的提取数据，如 payToken 列表；routing 时包含 paymentMethodsByPayToken（按 payToken 汇总的支付方式，来自 paymentListSearch） */
  extractedData?: Record<string, unknown>;
  error?: string;
}

/** 单条支付方式：name 名称，selected 是否默认选中，isHide 是否默认折叠 */
export interface PaymentWayItem {
  name: string;
  selected?: boolean;
  isHide?: boolean;
}

/** 单个 payToken 下发的支付方式：自有 displayPayways + 三方 thirdPartyDisplayInfoList */
export interface PaymentMethodsForPayToken {
  ownPayways: PaymentWayItem[];
  thirdParty: PaymentWayItem[];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractPayToken(log: BatLogEntry): string | null {
  try {
    const parsed = log.parsedMessage as Record<string, unknown> | undefined;
    if (!parsed) return null;
    const res = parsed.response as Record<string, unknown> | undefined;
    if (res?.body && typeof (res.body as Record<string, unknown>).tradeNo === "string") return (res.body as Record<string, unknown>).tradeNo as string;
    if (typeof res?.payToken === "string") return res.payToken as string;
    const req = parsed.request as Record<string, unknown> | undefined;
    if (typeof req?.payToken === "string") return req.payToken as string;
    return null;
  } catch {
    return null;
  }
}

function toPaymentWayItem(item: Record<string, unknown>): PaymentWayItem {
  return {
    name: String(item.name ?? ""),
    selected: item.selected === true,
    isHide: item.isHide === true,
  };
}

/** 从 paymentListSearch 单条日志的 rawMessage 中提取 payToken 及下发的支付方式 */
function extractPaymentMethodsFromPaymentListSearchLog(rawMessage: Record<string, unknown> | undefined): { payToken: string; ownPayways: PaymentWayItem[]; thirdParty: PaymentWayItem[] } | null {
  if (!rawMessage) return null;
  try {
    const req = rawMessage.request as Record<string, unknown> | undefined;
    const payToken = typeof req?.payToken === "string" ? req.payToken : "";
    if (!payToken) return null;
    const res = rawMessage.response as Record<string, unknown> | undefined;
    const displayInfo = res?.displayInfo as Record<string, unknown> | undefined;
    const ownPayDisplayInfo = displayInfo?.ownPayDisplayInfo as Record<string, unknown> | undefined;
    const displayPayways = Array.isArray(ownPayDisplayInfo?.displayPayways) ? ownPayDisplayInfo.displayPayways as Record<string, unknown>[] : [];
    const thirdPartyDisplayInfoList = Array.isArray(displayInfo?.thirdPartyDisplayInfoList) ? displayInfo.thirdPartyDisplayInfoList as Record<string, unknown>[] : [];
    return {
      payToken,
      ownPayways: displayPayways.map(toPaymentWayItem),
      thirdParty: thirdPartyDisplayInfoList.map(toPaymentWayItem),
    };
  } catch {
    return null;
  }
}

/** 从 routing 结果中按 payToken 汇总 paymentListSearch 下发的支付方式 */
function aggregatePaymentMethodsByPayToken(results: InterfaceLogQueryResult["results"]): Record<string, PaymentMethodsForPayToken> {
  const byPayToken: Record<string, PaymentMethodsForPayToken> = {};
  for (const r of results) {
    if (r.command !== "paymentListSearch" || !r.logs) continue;
    for (const log of r.logs) {
      const raw = log.rawMessage as Record<string, unknown> | undefined;
      const extracted = extractPaymentMethodsFromPaymentListSearchLog(raw);
      if (extracted) {
        byPayToken[extracted.payToken] = {
          ownPayways: extracted.ownPayways,
          thirdParty: extracted.thirdParty,
        };
      }
    }
  }
  return byPayToken;
}

function extractLogInfo(log: BatLogEntry, extractors?: Record<string, (l: BatLogEntry) => unknown>): InterfaceLogInfo {
  const parsed = log.parsedMessage as Record<string, unknown> | undefined;
  const extractedData: Record<string, unknown> = {};
  if (extractors?.payToken) {
    const v = extractors.payToken(log);
    if (v) extractedData.payToken = v;
  }
  const info: InterfaceLogInfo = {
    logId: log.id,
    timestamp: log.timestamp,
    timeStr: log.timeStr ?? new Date(log.timestamp).toISOString(),
    traceId: log.traceId,
    extractedData: Object.keys(extractedData).length ? extractedData : undefined,
  };
  if (parsed) {
    info.serviceName = (parsed.command ?? parsed.serviceName) as string | undefined;
    info.command = parsed.command as string | undefined;
    const res = parsed.response as Record<string, unknown> | undefined;
    if (res) {
      const header = res.header as Record<string, unknown> | undefined;
      const head = res.head as Record<string, unknown> | undefined;
      if (header && typeof header.resultCode !== "undefined") info.responseCode = String(header.resultCode);
      else if (head && typeof head.code !== "undefined") info.responseCode = String(head.code);
      if (header && typeof header.resultMessage === "string") info.responseMessage = header.resultMessage as string;
      else if (head && typeof head.msg === "string") info.responseMessage = head.msg as string;
    }
    info.rawMessage = parsed;
  }
  return info;
}

/** 判断是否像订单号（纯数字），payment 必须用 PayToken(tradeNo) 不能传订单号 */
function looksLikeOrderId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

/** PayToken(tagValue) 以 F 结尾时使用此 appId */
const PAYMENT_APPID_PAYTOKEN_F = 100054388;
const PAYMENT_APPID_DEFAULT = 100033783;

/** 判断 PayToken 是否以 F 结尾（兼容尾部空白、零宽字符、全角 F） */
function payTokenEndsWithF(tagValue: string): boolean {
  const s = String(tagValue ?? "")
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]+$/g, "");
  if (s.length === 0) return false;
  const code = s.charCodeAt(s.length - 1);
  return code === 70 || code === 102 || code === 0xff26 || code === 0xff46; // F, f, Ｆ, ｆ
}

export async function queryInterfaceLogs(
  queryType: string,
  tagValue: string,
  fromDate: number | string,
  toDate: number | string,
  env: "PROD" | "FAT" = "PROD",
  customQueries?: InterfaceQueryConfigItem[]
): Promise<InterfaceLogQueryResult> {
  let queries = customQueries ?? INTERFACE_QUERY_CONFIGS[queryType];
  if (!queries) {
    return { success: false, queryType, totalLogs: 0, results: [], error: `未知的查询类型: ${queryType}` };
  }
  if (queryType === "payment" && looksLikeOrderId(tagValue)) {
    return {
      success: false,
      queryType,
      totalLogs: 0,
      results: [],
      error:
        "支付提交(payment) 必须使用 PayToken(tradeNo) 作为 tagValue，不能传订单号。请先调用 payment_trace 获取该订单的 payToken 再查询。PayToken 以 F 结尾时使用 appId 100054388。",
    };
  }
  // payment 只查一次：根据 tagValue 是否以 F 结尾选择 appId（明确使用 100054388 / 100033783）
  if (queryType === "payment") {
    const base = queries[0];
    const endsWithF = payTokenEndsWithF(tagValue);
    const appId = endsWithF ? PAYMENT_APPID_PAYTOKEN_F : PAYMENT_APPID_DEFAULT;
    queries = [
      {
        ...base,
        appId,
        description: endsWithF ? "支付提交(PayToken以F结尾)" : base.description,
      },
    ];
  }
  const extractors: Record<string, (l: BatLogEntry) => unknown> = queryType === "creation" ? { payToken: extractPayToken } : {};
  const allLogs: InterfaceLogInfo[] = [];
  const results: InterfaceLogQueryResult["results"] = [];
  const extractedDataAgg: Record<string, unknown[]> = {};
  const tagValues = queryType === "routing" && tagValue.includes(",") ? tagValue.split(",").map((v) => v.trim()).filter(Boolean) : [tagValue];
  let taskIndex = 0;
  for (const query of queries) {
    for (const currentTagValue of tagValues) {
      if (taskIndex > 0) await delay(taskIndex * 800);
      taskIndex++;
      const queryLabel = tagValues.length > 1 ? `${query.description} (${currentTagValue})` : query.description;
      try {
        const batResult = await queryBat({
          appId: query.appId,
          fromDate: typeof fromDate === "number" ? fromDate : new Date(fromDate).getTime(),
          toDate: typeof toDate === "number" ? toDate : new Date(toDate).getTime(),
          message: query.message,
          command: query.command ?? "",
          tagKey: query.tagKey,
          tagValue: currentTagValue,
          isPrd: env === "PROD",
        });
        if (batResult.status === 200 && batResult.parsed?.logs) {
          const filtered = batResult.parsed.logs.filter((log) => {
            const c = String((log.parsedMessage as Record<string, unknown>)?.command ?? "");
            return (query.message && (log.message?.includes(query.message!) || c.includes(query.message!))) || (query.command && c.includes(query.command ?? ""));
          });
          const logs = filtered.map((log) => extractLogInfo(log, extractors));
          logs.forEach((l) => {
            allLogs.push(l);
            if (l.extractedData) {
              for (const [key, value] of Object.entries(l.extractedData)) {
                if (value == null) continue;
                if (!extractedDataAgg[key]) extractedDataAgg[key] = [];
                if (!extractedDataAgg[key].includes(value)) extractedDataAgg[key].push(value);
              }
            }
          });
          results.push({ query: queryLabel, appId: query.appId, message: query.message, command: query.command, success: filtered.length > 0, logCount: filtered.length, logs });
        } else {
          results.push({ query: queryLabel, appId: query.appId, message: query.message, command: query.command, success: false, logCount: 0, logs: [], error: batResult.error ?? "查询失败或无数据" });
        }
      } catch (e) {
        results.push({ query: queryLabel, appId: query.appId, message: query.message, command: query.command, success: false, logCount: 0, logs: [], error: e instanceof Error ? e.message : "未知错误" });
      }
    }
  }
  const extractedDataTop: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(extractedDataAgg)) {
    extractedDataTop[key] = [...new Set(values)];
  }
  if (queryType === "routing") {
    const paymentMethodsByPayToken = aggregatePaymentMethodsByPayToken(results);
    if (Object.keys(paymentMethodsByPayToken).length > 0) {
      extractedDataTop.paymentMethodsByPayToken = paymentMethodsByPayToken;
    }
  }
  return {
    success: allLogs.length > 0,
    queryType,
    totalLogs: allLogs.length,
    results,
    extractedData: Object.keys(extractedDataTop).length > 0 ? extractedDataTop : undefined,
  };
}

export const interfaceLogQueryTool = tool(
  async ({ queryType, tagValue, fromDate, toDate, env }) => {
    if (!queryType) return JSON.stringify({ success: false, error: "请提供查询类型。支持: creation、routing、payment" }, null, 2);
    if (!tagValue) return JSON.stringify({ success: false, error: "请提供标签值：创单用订单号(outTradeNo)、路由用 PageTraceId(paytraceid)、支付用 PayToken(tradeNo)" }, null, 2);
    if (queryType === "payment" && /^\d+$/.test(tagValue.trim())) {
      return JSON.stringify({
        success: false,
        error:
          "支付提交(payment) 必须使用 PayToken(tradeNo) 作为 tagValue，不能传订单号。请先调用 payment_trace 获取该订单的 payToken 再查询。PayToken 以 F 结尾时会自动使用 appId 100054388。",
      }, null, 2);
    }
    if (!fromDate || !toDate) return JSON.stringify({ success: false, error: "请提供时间范围（fromDate 和 toDate）。建议先调用 payment_trace 获取时间信息。" }, null, 2);
    try {
      const result = await queryInterfaceLogs(queryType, tagValue, fromDate, toDate, (env as "PROD" | "FAT") ?? "PROD");
      return JSON.stringify(result, null, 2);
    } catch (e) {
      return JSON.stringify({ success: false, queryType, error: e instanceof Error ? e.message : "未知错误" }, null, 2);
    }
  },
  {
    name: "interface_log_query",
    description:
      "通用接口日志查询。创单(creation)用订单号、路由(routing)用 PageTraceId。回答「订单下发了哪些支付方式」「收银台有哪些支付方式」时必须用 queryType=routing、tagValue=pageTraceId 调用本工具，返回的 extractedData.paymentMethodsByPayToken 即下发的支付方式列表（来自 33482 paymentListSearch）；禁止仅用 payment_trace 回答。查支付提交(payment)时必须先调用 payment_trace 获取 payToken 再查。",
    schema: z.object({
      queryType: z.string().describe("查询类型：creation、routing、payment 或 custom"),
      tagValue: z.string().describe("标签值：创单用订单号(outTradeNo)；路由用 PageTraceId(paytraceid)可逗号分隔；支付用 PayToken(tradeNo)"),
      fromDate: z.string().describe("起始时间，时间戳或 ISO 字符串"),
      toDate: z.string().describe("结束时间，时间戳或 ISO 字符串"),
      env: z.string().optional().describe("环境：PROD 或 FAT，默认 PROD"),
    }),
  }
);
