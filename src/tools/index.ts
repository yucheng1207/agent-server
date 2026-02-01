/**
 * 工具注册（与 agent-demo 对齐，全部补全）
 */

import { paymentTraceTool } from "./payment-trace.js";
import { batQueryTool } from "./bat-query.js";
import { interfaceLogQueryTool } from "./interface-log-query.js";
import { frontendLogQueryTool, frontendLogRulesTool } from "./frontend-log-query.js";
import { paySubmitFlowTool } from "./pay-submit-flow.js";

export const tools = [
  paymentTraceTool,
  paySubmitFlowTool,
  batQueryTool,
  interfaceLogQueryTool,
  frontendLogQueryTool,
  frontendLogRulesTool,
];

export const toolNameMap: Record<string, string> = {
  payment_trace: "支付链路追踪",
  pay_submit_flow: "支付提交流程",
  bat_query: "BAT日志查询",
  interface_log_query: "接口日志查询",
  frontend_log_query: "前端埋点查询",
  frontend_log_rules: "前端埋点规则",
};

export { paymentTraceTool } from "./payment-trace.js";
export { paySubmitFlowTool } from "./pay-submit-flow.js";
export { batQueryTool } from "./bat-query.js";
export { interfaceLogQueryTool } from "./interface-log-query.js";
export { frontendLogQueryTool, frontendLogRulesTool } from "./frontend-log-query.js";
