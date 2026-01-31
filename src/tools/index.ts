/**
 * 工具注册（与 agent-demo 对齐，全部补全）
 */

import { paymentTraceTool } from "./payment-trace.js";
import { orderQueryTool } from "./order-query.js";
import { batQueryTool } from "./bat-query.js";
import { interfaceLogQueryTool } from "./interface-log-query.js";
import { frontendLogQueryTool, frontendLogRulesTool } from "./frontend-log-query.js";
import { logAnalysisTool } from "./log-analysis.js";
import { systemStatusTool } from "./system-status.js";
import { payChannelTool } from "./pay-channel.js";
import { ruleEngineTool } from "./rule-engine.js";

export const tools = [
  paymentTraceTool,
  batQueryTool,
  interfaceLogQueryTool,
  frontendLogQueryTool,
  frontendLogRulesTool,
  orderQueryTool,
  logAnalysisTool,
  systemStatusTool,
  payChannelTool,
  ruleEngineTool,
];

export const toolNameMap: Record<string, string> = {
  payment_trace: "支付链路追踪",
  bat_query: "BAT日志查询",
  interface_log_query: "接口日志查询",
  frontend_log_query: "前端埋点查询",
  frontend_log_rules: "前端埋点规则",
  order_query: "订单查询",
  log_analysis: "日志分析",
  system_status: "系统状态",
  pay_channel: "支付渠道",
  rule_engine: "规则引擎",
};

export { paymentTraceTool } from "./payment-trace.js";
export { orderQueryTool } from "./order-query.js";
export { batQueryTool } from "./bat-query.js";
export { interfaceLogQueryTool } from "./interface-log-query.js";
export { frontendLogQueryTool, frontendLogRulesTool } from "./frontend-log-query.js";
export { logAnalysisTool } from "./log-analysis.js";
export { systemStatusTool } from "./system-status.js";
export { payChannelTool } from "./pay-channel.js";
export { ruleEngineTool } from "./rule-engine.js";
