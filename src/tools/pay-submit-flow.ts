/**
 * 支付提交流程查询工具
 * 通过 FullLink queryTraceNodeInfo 接口，根据 pageTraceId 查询订单支付提交流程：
 * 支付提交开始 → 风控验证 → 支付前校验 → 支付提交结束 → 网关扣款成功
 * 输出：支付方式、风控验证情况、最终结果，并为支付提交相关节点生成 BAT 链接。
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TRACE_NODE_API, FRONTEND_LOG_COOKIE } from "../config.js";

const PAY_SUBMIT_END_CODE: Record<string, string> = {
  "1": "支付提交失败(1)",
  "4": "支付单已提交",
  "5": "礼品卡金额不足",
  "6": "常用卡已删除",
  "8": "实时支付已成功，重复提交",
  "9": "指纹支付验证失败",
  "11": "支付方式不可用",
  "12": "扣款成功",
  "13": "银行和卡号不一致",
  "14": "储蓄卡扣款失败",
  "16": "风控补充验证",
  "17": "风控补充验证失败",
  "18": "拿去花余额不足",
  "19": "用户积分数不足",
  "21": "3DS验证",
  "22": "支付密码锁定",
  "23": "支付密码不正确",
  "24": "订单已支付成功,请勿重复支付!",
  "25": "银行卡余额不足",
  "26": "好友已支付",
  "31": "优惠不可用（卡不满足当前优惠）",
  "32": "优惠不可用（达到优惠次数上限）",
  "33": "优惠不可用（活动结束）",
  "34": "优惠不可用（超出库存）",
  "35": "优惠不可用（有可用活动）",
  "36": "需要补充银行卡信息",
  "37": "短信失败",
  "38": "短信失败",
  "39": "短信失败",
  "40": "闪游卡余额不足",
  "41": "拿去花人脸识别风控",
  "42": "人脸验证失败",
  "43": "3ds设备信息收集",
  "44": "闪游卡费率",
  "46": "该活动限本人卡支付使用",
  "47": "卡过期（coins冻结失败）",
  "48": "联系银行（coins验证失败不可重试）",
  "51": "短信验证码错误，请重新获取",
  "52": "需要补填全要素",
  "53": "开通拿去花失败，请更换支付方式",
  "54": "EGIFT余额扣款失败",
  "55": "需要衍生密码",
  "56": "Token支付失败，降级原卡支付",
  "57": "恒生积分抵扣失败",
  "58": "token支付可使用积分提示",
  "59": "token支付可使用程金币提示",
  "60": "绑卡场景token失效",
  "61": "密码组件验证失败",
  "62": "钱包绑卡支付支持DCC",
  "63": "收取外卡手续费",
  "64": "钱包绑卡支付需要补填要素",
  "65": "钱包绑卡支付支持分期",
  "66": "中台风控补充验证中",
  "67": "持卡人与要求不符",
  "68": "微信代付超时（订单超时）",
  "69": "未设置支付密码",
  "70": "需要开通微信免密",
  "71": "需要开通支付宝免密",
  "72": "三方需要重新rebind",
  "73": "新模式芝麻分需要授权确认",
  "74": "获取第三方授权码（微信authCode/支付宝token）",
  "75": "该银行卡即将过期",
  "76": "短信验证码发送失败",
  "77": "卡支付失败，引导银行转账",
  "79": "notify超时",
  "80": "已有bill正在支付中",
  "81": "后付超过截止时间提交",
  "82": "持卡人校验不符",
  "83": "AgencyModel KR航空二期新增校验",
  "84": "高风控，可以申诉",
  "85": "一键绑卡金额超限",
  "86": "拿去花支付失败",
  "87": "优惠不可用（保险）",
  "88": "需要更换通道（3ds）",
  "89": "提交失败（展示后付操作按钮）",
  "90": "固定RC（启用extendErrorCode）",
  "92": "先享后付",
  "93": "trainPal支付失败",
  "100000": "支付提交处理中",
  "100001": "支付提交失败(100001)",
  "199999": "支付提交失败(199999)",
};

const EXTEND_ERROR_CODE: Record<string, string> = {
  "1": "INSTALLMENT_UNAVAILABLE：分期不可用",
  "2": "INSTALLMENT_SPECIFIED_UNAVAILABLE：指定分期不可用",
  "3": "INSTALLMENT_CHANGE_BANK_SUPPORT：新卡分期支付，更换银行分期可用",
  "4": "INSTALLMENT_CHANGE_BANK_NOT_SUPPORT：新卡分期支付，更换银行分期不可用",
  "5": "INSTALLMENT_INTEREST_FREE_UNAVAILABLE：免息优惠不可用",
  "6": "POINT_NOT_ENOUGH：酒店积分抵房费场景，积分不足",
  "7": "INTERACTIVE_OPTIMIZATION_OF_PAYMENT_HIGHRISK_SCENARIOS：支付高风险场景优化",
  "8": "CARD_DOWNGRADE：金融还款卡类限额后需要降级到三方支付",
  "9": "CLEAR_OBSTACLE：一键清障",
  "10": "FAST_PAY_RISK_REBIND：极速rebind场景",
  "11": "CFT_PENALTY_INTEREPTION：程付通余额场景+卡惩戒状态",
  "12": "USERACCOUNT_BALANCE_NOT_ENOUGH：程付通余额不足",
  "13": "RISK_RAPID_NO_NEED_VERIFY：程付通无需验证",
  "14": "INSTALLMENT_UNAVAILABLE_WITH_DISCOUNT：随机优惠导致信用卡分期不满足分期门槛",
  "15": "BUY_NOW_PAY_LATER_NOT_OPEN：需要开通先享后付",
  "16": "SPLIT_ORDER_PAYMENT：门票拆单场景",
  "17": "AlIPAY_NOPASSWORD_TO_NORMAL：支付宝免密支付失败，降级支付宝支付",
  "18": "LARGEREMITTANCE_REALNAME_AUTH：银行转账需要补充实名信息",
  "19": "CFT_CHANNEL_OVER_LIMIT：卡通道限额",
};

/** 需要生成 BAT 链接的节点关键词（支付提交相关） */
const BAT_NODE_KEYWORDS = [
  "支付提交开始",
  "风控校验1130",
  "风控1130",
  "风控1002",
  "支付前校验",
  "支付提交结束",
];

/** 不生成 BAT 的节点 */
const NO_BAT_KEYWORDS = ["通知交易", "通知BU", "最终支付结果通知"];

/** queryTraceNodeInfo 返回的 infoList 单项 */
interface InfoListItem {
  key: string;
  value: string | number | null;
}

/** queryTraceNodeInfo 返回的 displayInfos 单项（与接口一致） */
interface DisplayInfo {
  name?: string;
  status?: number | null;
  infoList?: InfoListItem[];
  date?: string;
  type?: string;
  subType?: string | null;
  extend?: unknown;
  during?: number;
  appId?: string | number | null;
  catMessageId?: string | null;
}

interface TraceDataItem {
  payToken?: string;
  paymentTraceId?: string;
  date?: string;
  displayInfos?: DisplayInfo[];
}

function nodeLabel(info: DisplayInfo): string {
  return info?.name?.trim() || "未知节点";
}

/** 从 infoList 构建 key -> value 表，仅保留 value 非 null 且非空且非字符串 "null" 的项 */
function getInfoMap(info: DisplayInfo): Record<string, string | number> {
  const map: Record<string, string | number> = {};
  const list = info?.infoList;
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    if (item == null || !item.key) continue;
    const v = item.value;
    if (v == null) continue;
    if (typeof v === "string" && (v.trim() === "" || v === "null")) continue;
    map[item.key] = v;
  }
  return map;
}

function shouldGenBat(label: string): boolean {
  const lower = label;
  if (NO_BAT_KEYWORDS.some((k) => lower.includes(k))) return false;
  return BAT_NODE_KEYWORDS.some((k) => lower.includes(k));
}

/** 将 date 转为毫秒时间戳（支持 number 或 "2026-02-01 16:06:55.397" 格式） */
function parseDateToMs(value: unknown): number {
  if (value == null) return NaN;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const s = String(value).trim();
  if (!s) return NaN;
  const t = new Date(s.replace(/\s+/, "T") + (s.match(/\d{4}-\d{2}-\d{2}$/) ? "Z" : ""));
  return Number.isNaN(t.getTime()) ? NaN : t.getTime();
}

function buildBatLink(info: DisplayInfo): string | null {
  const dateMs = parseDateToMs(info.date);
  const appId = info.appId != null && String(info.appId) !== "null" ? String(info.appId) : "";
  const catMessageId = info.catMessageId != null && String(info.catMessageId) !== "null" ? String(info.catMessageId) : "";
  if (Number.isNaN(dateMs) || dateMs <= 0 || !appId || !catMessageId) return null;
  const fromTime = dateMs - 5 * 60 * 1000;
  const toTime = dateMs + 5 * 60 * 1000;
  return `https://bat.fx.ctripcorp.com/trace/${catMessageId}?${appId}&identifier=clog&from=${fromTime}&to=${toTime}`;
}

/** 从「获取基础数据」节点取支付方式、优惠（infoList 的 key-value） */
function extractPayMethodAndDiscount(displayInfos: DisplayInfo[]): { payMethod?: string; discount?: string } {
  for (const info of displayInfos) {
    if (info == null) continue;
    if (!nodeLabel(info).includes("获取基础数据")) continue;
    const map = getInfoMap(info);
    const pay1 = map["支付方式1"];
    const pay2 = map["支付方式2"];
    const discount = map["优惠"];
    const payMethod = pay1 || pay2 ? [pay1, pay2].filter(Boolean).map(String).join("；") : undefined;
    return { payMethod, discount: discount != null ? String(discount) : undefined };
  }
  return {};
}

/** 状态码 → 文案（0=成功 1=失败 2=转异步） */
const STATUS_TEXT: Record<string, string> = {
  "0": "成功",
  "1": "失败",
  "2": "转异步",
};

/** 状态 0/1/2 转为中文展示 */
function formatStatus(status: number | null | undefined): string | undefined {
  if (status === undefined || status === null) return undefined;
  const s = String(status).trim();
  if (s === "") return undefined;
  return STATUS_TEXT[s] ?? s;
}

/** 仅当值存在且非 "null" 字符串时输出一行 */
function pushLine(lines: string[], key: string, val: string | number | null | undefined): void {
  if (val == null) return;
  const s = String(val).trim();
  if (s === "" || s === "null") return;
  lines.push(`- **${key}**：${val}`);
}

/** 按 queryTraceNodeInfo 实际结构：顶层 date/during/status/type/subType/appId + infoList 的 key-value */
function formatNodeDetail(info: DisplayInfo): string[] {
  if (info == null || typeof info !== "object") return [];
  const label = nodeLabel(info);
  const lines: string[] = [];
  lines.push(`### ${label}`);
  pushLine(lines, "date", info.date);
  pushLine(lines, "耗时", info.during != null ? `${info.during}ms` : undefined);
  pushLine(lines, "状态", formatStatus(info.status));
  pushLine(lines, "type", info.type);
  pushLine(lines, "subType", info.subType != null ? String(info.subType) : undefined);
  pushLine(lines, "appId", info.appId != null && String(info.appId) !== "null" ? String(info.appId) : undefined);
  const infoMap = getInfoMap(info);
  for (const [key, value] of Object.entries(infoMap)) {
    if (key === "返回debugMessage" && (value === "" || value === "null")) continue;
    pushLine(lines, key, value);
  }
  return lines;
}

async function queryTraceNodeInfo(pageTraceId: string, cid: string): Promise<{ data?: TraceDataItem[]; [key: string]: unknown }> {
  const xTraceID = `${cid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const url = `${TRACE_NODE_API}?serviceCode=1&_fxpcqlniredt=${encodeURIComponent(cid)}&x-traceID=${encodeURIComponent(xTraceID)}`;
  const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        "cache-control": "no-cache",
        cookie: FRONTEND_LOG_COOKIE,
        origin: "https://ptrace.ctripcorp.com",
        referer: "https://ptrace.ctripcorp.com/",
      },
      body: JSON.stringify({
        timeout: 0,
        extension: [{ name: "locale", value: "zh-CN" }],
        pageTraceId,
        head: {
          cid,
          ctok: "",
          cver: "1.0",
          lang: "01",
          sid: "8888",
          syscode: "09",
          auth: "",
          xsid: "",
          extension: [],
        },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    const json = JSON.parse(text) as Record<string, unknown>;
    if ((json.returncode as number) === -100 || json.message === "not login") {
      throw new Error("API 认证失败：需要配置 FRONTEND_LOG_COOKIE（与 ptrace 同源）");
    }
    return json as { data?: TraceDataItem[] };
  } finally {
    if (originalTls !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls;
    else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }
}

function formatReport(pageTraceId: string, dataItems: TraceDataItem[]): string {
  const sections: string[] = [];
  sections.push(`## 支付提交流程（pageTraceId: ${pageTraceId}）\n`);

  for (let idx = 0; idx < dataItems.length; idx++) {
    const item = dataItems[idx];
    const displayInfos = item.displayInfos ?? [];
    if (displayInfos.length === 0) continue;

    const { payMethod, discount } = extractPayMethodAndDiscount(displayInfos);
    if (payMethod) sections.push(`**支付方式**：${payMethod}`);
    if (discount) sections.push(`**优惠信息**：${discount}`);

    for (const info of displayInfos) {
      if (info == null) continue;
      sections.push(...formatNodeDetail(info));
      sections.push("");
    }

    const riskLevels: string[] = [];
    let submitEndCode: string | undefined;
    let submitEndCodeText = "";
    let extendErrorCode: string | undefined;
    let submitEndReturnMessage = "";
    const flowSteps: string[] = [];
    const batLinks: string[] = [];

    for (const info of displayInfos) {
      if (info == null) continue;
      const label = nodeLabel(info);
      const map = getInfoMap(info);
      if (label.includes("风控1002")) {
        const level = map["riskLevel"];
        if (level != null) riskLevels.push(`风控1002 等级: ${level}（200 以内正常，>200 为高风控）`);
      }
      if (label.includes("支付提交结束")) {
        const codeVal = map["返回code"];
        submitEndCode = codeVal != null ? String(codeVal) : undefined;
        submitEndCodeText = submitEndCode ? PAY_SUBMIT_END_CODE[submitEndCode] ?? `code=${submitEndCode}` : "";
        const extCode = map["extendErrorCode"];
        extendErrorCode = extCode != null ? String(extCode) : undefined;
        const msgVal = map["返回message"];
        if (msgVal != null && String(msgVal).trim() !== "" && String(msgVal) !== "null") submitEndReturnMessage = String(msgVal);
      }

      const batUrl = shouldGenBat(label) ? buildBatLink(info) : null;
      if (batUrl) batLinks.push(`[BAT链接](${batUrl})`);

      if (label.includes("支付提交开始")) flowSteps.push("支付提交开始");
      else if (label.includes("风控校验1130") || label.includes("风控1130")) flowSteps.push("风控校验1130");
      else if (label.includes("风控1002")) flowSteps.push("风控1002");
      else if (label.includes("支付前校验")) flowSteps.push("支付前校验");
      else if (label.includes("支付提交结束")) flowSteps.push("支付提交结束");
      else if (label.includes("网关扣款成功")) flowSteps.push("网关扣款成功");
    }

    if (flowSteps.length) sections.push(`**流程节点**：${flowSteps.join(" → ")}`);
    if (riskLevels.length) sections.push(`**风控验证**：${riskLevels.join("；")}`);

    const SUCCESS_CODES = new Set(["4", "8", "12", "100000"]);
    if (submitEndCode !== undefined) {
      const isFailure = !SUCCESS_CODES.has(String(submitEndCode));
      const displayText = isFailure ? `\`${submitEndCodeText}\`` : submitEndCodeText;
      let resultLine = `**支付提交结果**：${displayText}`;
      if (extendErrorCode && submitEndCode === "90") {
        resultLine += `（extendErrorCode: ${EXTEND_ERROR_CODE[extendErrorCode] ?? extendErrorCode}）`;
      }
      sections.push(resultLine);
    }
    sections.push(
      submitEndReturnMessage
        ? `**给用户的提示（返回message）**：${submitEndReturnMessage}`
        : "**给用户的提示（返回message）**：无。若本单为失败场景但此处无值，前端不会弹框，属服务问题需开发排查。"
    );
    if (batLinks.length) sections.push(`后端日志：${batLinks.join(" ")}`);

    sections.push("");
  }

  sections.push(
    "**说明**：支付提交结束表示 303 返回。code 4、8、12 表示成功；31=卡不满足当前优惠、32=达到优惠次数上限、33=活动结束、34=超出库存、35=有可用活动、87=保险优惠不可用处理；100000 一般为三方支付。**具体给用户的提示以该 code 返回的 message 为准**。若无法从后端日志分析失败原因，可查前端埋点 chainName=receive303 的 debugMessage。"
  );
  return sections.join("\n");
}

export async function queryPaySubmitFlow(
  pageTraceId: string,
  cid: string = "09031055410757412606"
): Promise<{ success: boolean; report?: string; error?: string; raw?: TraceDataItem[] }> {
  try {
    const json = await queryTraceNodeInfo(pageTraceId, cid);
    const data = json.data;
    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, error: "未查询到该 pageTraceId 的节点数据", raw: data as TraceDataItem[] };
    }
    const report = formatReport(pageTraceId, data);
    return { success: true, report, raw: data };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "未知错误",
    };
  }
}

export const paySubmitFlowTool = tool(
  async ({ pageTraceId, cid }) => {
    if (!pageTraceId) return "请提供 pageTraceId 以查询支付提交流程。";
    const result = await queryPaySubmitFlow(pageTraceId, cid || "09031055410757412606");
    if (!result.success) return result.error ?? "查询失败";
    return result.report ?? "";
  },
  {
    name: "pay_submit_flow",
    description:
      "根据 pageTraceId 查询订单支付提交流程。调用 FullLink queryTraceNodeInfo 接口，解析支付提交开始、风控验证、支付前校验、支付提交结束、网关扣款成功等节点，输出支付方式、风控验证情况、最终结果，并为支付提交相关节点生成 BAT 链接。需先通过 payment_trace 获取 pageTraceId。",
    schema: z.object({
      pageTraceId: z.string().describe("页面追踪ID，用于关联支付提交流程，通常由 payment_trace 得到"),
      cid: z.string().optional().describe("可选，用户/设备标识，默认 09031055410757412606"),
    }),
  }
);
