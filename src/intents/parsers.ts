/**
 * 意图链中某步工具结果的解析器
 * 用于从上一步返回文本/JSON 中提取下一步所需参数（如 pageTraceId、fromDate、toDate）
 */

/**
 * 将「订单时间」解析为 Date（按携程业务习惯视为中国时区 UTC+8），
 * 避免服务器在 UTC 时区时把 "2026-02-01 16:06:47" 当成 UTC 导致时间窗口错 8 小时。
 */
function parseOrderTimeAsChina(orderTimeStr: string): Date | null {
  const t = new Date(orderTimeStr.trim().replace(/\s+/, "T") + "+08:00");
  return Number.isNaN(t.getTime()) ? null : t;
}

const ORDER_TIME_REG = /订单时间[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;
const ORDER_TIME_FALLBACK_REG = /订单时间[\s\S]{0,80}?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;

function extractOrderTimeMillis(raw: string): number | null {
  const m = raw.match(ORDER_TIME_REG) || raw.match(ORDER_TIME_FALLBACK_REG);
  if (!m) return null;
  const t = parseOrderTimeAsChina(m[1].trim());
  return t ? t.getTime() : null;
}

/** payment_trace 返回文本中解析 pageTraceId、订单时间，并推算 fromDate/toDate（毫秒时间戳字符串）；路由/支付用：订单 -5min ~ +30min */
export function parsePaymentTraceSummary(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pageTraceIdMatch = raw.match(/PageTraceId[：:]\s*([a-f0-9-]+)/i) || raw.match(/pageTraceId[":\s]+([a-f0-9-]+)/i);
  if (pageTraceIdMatch) out.pageTraceId = pageTraceIdMatch[1].trim();

  const orderTimeMs = extractOrderTimeMillis(raw);
  if (orderTimeMs != null) {
    const from = new Date(orderTimeMs - 5 * 60 * 1000);
    const to = new Date(orderTimeMs + 30 * 60 * 1000);
    out.fromDate = String(from.getTime());
    out.toDate = String(to.getTime());
  }
  return out;
}

/** 创单日志用：订单时间 ±2 分钟（4 分钟窗口），与可用的 BFF 创单查询 curl 一致 */
export function parsePaymentTraceCreationWindow(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const orderTimeMs = extractOrderTimeMillis(raw);
  if (orderTimeMs != null) {
    const from = new Date(orderTimeMs - 2 * 60 * 1000);
    const to = new Date(orderTimeMs + 2 * 60 * 1000);
    out.fromDate = String(from.getTime());
    out.toDate = String(to.getTime());
  }
  return out;
}

const parsers: Record<string, (raw: string) => Record<string, string>> = {
  payment_trace_summary: parsePaymentTraceSummary,
  payment_trace_creation_window: parsePaymentTraceCreationWindow,
};

export function getStepResultParser(name: string): ((raw: string) => Record<string, string>) | null {
  return parsers[name] ?? null;
}
