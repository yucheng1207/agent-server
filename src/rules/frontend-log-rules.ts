/**
 * 前端埋点规则配置（与 agent-demo 对齐）
 */

export interface LogRule {
  key: string;
  description: string;
  category: "cashier" | "payment" | "result" | "api" | "other";
  isSuccess?: boolean;
  isFailure?: boolean;
  platform?: "mini" | "h5" | "app" | "all";
}

export interface ScenarioCondition {
  type: "contains" | "not_contains" | "all_of" | "any_of";
  keys: string[];
  description: string;
}

export interface BusinessScenarioRule {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  conditions: ScenarioCondition[];
  conclusionTemplate: { success: string; failure: string };
}

export const LOG_RULES: LogRule[] = [
  { key: "cashierShowDone", description: "收银台页面展示完成", category: "cashier", isSuccess: true },
  { key: "cashier_show_done", description: "收银台展示完成", category: "cashier", isSuccess: true },
  { key: "cpay.init", description: "支付SDK初始化完成", category: "cashier" },
  { key: "init", description: "支付初始化", category: "cashier" },
  { key: "paymentSubmit", description: "用户点击支付按钮", category: "payment" },
  { key: "paymentSubmitSuccess", description: "支付提交成功", category: "payment", isSuccess: true },
  { key: "send303", description: "发起303请求（支付提交）", category: "payment" },
  { key: "send_303", description: "发起303请求（支付提交）", category: "payment" },
  { key: "receive303-success", description: "303请求成功", category: "payment", isSuccess: true },
  { key: "d-weichat-submit-start", description: "微信支付提交开始", category: "payment" },
  { key: "d-weichat-submit-suc", description: "微信支付提交成功", category: "payment", isSuccess: true },
  { key: "paySuccess", description: "支付成功", category: "result", isSuccess: true },
  { key: "payFail", description: "支付失败", category: "result", isFailure: true },
  { key: "handleSubmitCallback-start", description: "开始拉起三方支付", category: "payment", platform: "mini" },
  { key: "handleSubmitCallback-success", description: "三方支付拉起成功", category: "payment", isSuccess: true, platform: "mini" },
  { key: "wx.requestpayment.cancel", description: "用户取消微信支付", category: "payment", platform: "mini" },
  { key: "wx.requestpayment.success", description: "微信支付成功", category: "payment", isSuccess: true, platform: "mini" },
  { key: "thirdPartyPaymentStart", description: "开始拉起三方支付", category: "payment", platform: "h5" },
  { key: "thirdPartyPaymentSuccess", description: "三方支付拉起成功", category: "payment", isSuccess: true, platform: "h5" },
  { key: "wechatPaymentStart", description: "调用微信支付", category: "payment", platform: "h5" },
  { key: "alipayPaymentStart", description: "调用支付宝支付", category: "payment", platform: "h5" },
  { key: "getPayway_suc", description: "获取支付方式成功", category: "api", isSuccess: true },
];

export const SCENARIO_RULES: BusinessScenarioRule[] = [
  {
    id: "cashier_enter_success",
    name: "进入收银台成功",
    description: "判断用户是否成功进入收银台",
    keywords: ["进入收银台", "打开收银台", "收银台成功"],
    conditions: [{ type: "any_of", keys: ["cashierShowDone", "cashier_show_done", "cpay.init", "init", "getPayway_suc"], description: "存在收银台初始化/展示完成的埋点" }],
    conclusionTemplate: { success: "✅ 用户成功进入收银台", failure: "❌ 用户未成功进入收银台" },
  },
  {
    id: "payment_submit",
    name: "支付提交",
    description: "判断用户是否提交了支付",
    keywords: ["提交支付", "点击支付", "支付提交"],
    conditions: [{ type: "any_of", keys: ["paymentSubmit", "send303", "send_303", "d-weichat-submit-start", "handleSubmitCallback-start"], description: "存在支付提交相关埋点" }],
    conclusionTemplate: { success: "✅ 用户已提交支付", failure: "❌ 用户未提交支付" },
  },
  {
    id: "third_party_payment_invoked",
    name: "三方支付是否拉起",
    description: "判断是否成功拉起三方支付",
    keywords: ["拉起支付", "三方支付", "微信支付", "支付宝"],
    conditions: [{ type: "any_of", keys: ["handleSubmitCallback-start", "thirdPartyPaymentStart", "wechatPaymentStart", "alipayPaymentStart", "d-weichat-submit-start"], description: "存在三方支付拉起的埋点" }],
    conclusionTemplate: { success: "✅ 已拉起三方支付", failure: "❌ 未拉起三方支付" },
  },
  {
    id: "third_party_payment_success",
    name: "三方支付拉起成功",
    description: "判断三方支付是否成功拉起",
    keywords: ["拉起成功", "三方支付成功"],
    conditions: [{ type: "any_of", keys: ["handleSubmitCallback-success", "thirdPartyPaymentSuccess", "wx.requestpayment.success", "d-weichat-submit-suc", "receive303-success"], description: "存在三方支付拉起成功的埋点" }],
    conclusionTemplate: { success: "✅ 三方支付拉起成功", failure: "❌ 三方支付拉起可能失败" },
  },
  {
    id: "wechat_payment_cancelled",
    name: "用户取消微信支付",
    description: "判断用户是否取消了微信支付",
    keywords: ["取消支付", "用户取消", "微信取消"],
    conditions: [{ type: "contains", keys: ["wx.requestpayment.cancel"], description: "存在微信支付取消埋点" }],
    conclusionTemplate: { success: "⚠️ 用户主动取消了微信支付", failure: "未发现用户取消支付" },
  },
];

export function getLogRule(key: string): LogRule | undefined {
  return LOG_RULES.find((r) => r.key.toLowerCase() === key.toLowerCase());
}

export function checkCondition(keys: string[], condition: ScenarioCondition): boolean {
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  switch (condition.type) {
    case "contains":
      return condition.keys.some((k) => keySet.has(k.toLowerCase()));
    case "not_contains":
      return !condition.keys.some((k) => keySet.has(k.toLowerCase()));
    case "all_of":
      return condition.keys.every((k) => keySet.has(k.toLowerCase()));
    case "any_of":
      return condition.keys.some((k) => keySet.has(k.toLowerCase()));
    default:
      return false;
  }
}

export function evaluateScenario(keys: string[], scenario: BusinessScenarioRule): { success: boolean; conclusion: string } {
  const met = scenario.conditions.some((c) => checkCondition(keys, c));
  return { success: met, conclusion: met ? scenario.conclusionTemplate.success : scenario.conclusionTemplate.failure };
}
