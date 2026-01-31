/**
 * 规则引擎诊断工具（与 agent-demo 对齐）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { TroubleshootRule } from "../types.js";

const troubleshootRules: TroubleshootRule[] = [
  { ruleId: "RULE-001", name: "余额不足", description: "用户账户余额不足导致支付失败", conditions: [{ field: "errorCode", operator: "equals", value: "INSUFFICIENT_BALANCE" }], solution: "1. 引导用户充值或更换支付方式\n2. 检查是否存在未释放的冻结金额", priority: 1 },
  { ruleId: "RULE-002", name: "渠道超时", description: "支付渠道响应超时", conditions: [{ field: "errorCode", operator: "equals", value: "CHANNEL_TIMEOUT" }], solution: "1. 检查对应支付渠道的系统状态\n2. 考虑临时切换到备用渠道", priority: 2 },
  { ruleId: "RULE-003", name: "风控拦截", description: "交易被风控规则拦截", conditions: [{ field: "errorCode", operator: "equals", value: "RISK_CONTROL" }], solution: "1. 查看具体触发的风控规则\n2. 如为误拦截，可申请人工审核放行", priority: 1 },
  { ruleId: "RULE-004", name: "签名验证失败", description: "支付请求签名验证不通过", conditions: [{ field: "errorCode", operator: "equals", value: "SIGN_ERROR" }], solution: "1. 检查商户密钥配置\n2. 确认签名算法版本是否匹配", priority: 3 },
];

const knowledgeBase: Record<string, string> = {
  支付失败: "常见原因：余额不足、渠道问题、风控拦截、银行卡限额、签名错误。建议先查订单详情获取错误码，再根据错误码查排障规则。",
  超时: "常见原因：渠道响应慢、网络问题、高并发。建议检查系统状态和具体超时渠道。",
  风控: "常见原因：大额交易、频繁交易、异地交易、新用户大额、黑名单。建议查看触发的风控规则，评估风险等级。",
};

async function matchRuleByErrorCode(errorCode: string): Promise<TroubleshootRule | null> {
  await new Promise((r) => setTimeout(r, 50));
  return troubleshootRules.find((r) => r.conditions.some((c) => c.field === "errorCode" && c.operator === "equals" && c.value === errorCode)) ?? null;
}

async function searchKnowledge(keyword: string): Promise<string | null> {
  await new Promise((r) => setTimeout(r, 50));
  const lower = keyword.toLowerCase();
  for (const [key, value] of Object.entries(knowledgeBase)) {
    if (key.toLowerCase().includes(lower)) return value;
  }
  return null;
}

function formatRule(rule: TroubleshootRule): string {
  return `📋 规则: ${rule.ruleId} - ${rule.name}\n描述: ${rule.description}\n优先级: ${rule.priority === 1 ? "高" : rule.priority === 2 ? "中" : "低"}\n\n💡 解决方案:\n${rule.solution}`;
}

export const ruleEngineTool = tool(
  async ({ errorCode, keyword }) => {
    try {
      if (errorCode) {
        const rule = await matchRuleByErrorCode(errorCode);
        if (rule) return formatRule(rule);
        return `未找到错误码 "${errorCode}" 对应的排障规则。建议确认错误码或查看日志。`;
      }
      if (keyword) {
        const knowledge = await searchKnowledge(keyword);
        if (knowledge) return `📚 知识库 - ${keyword}:\n\n${knowledge}`;
        return `未找到关键词 "${keyword}" 相关知识。可尝试：支付失败、超时、风控`;
      }
      let sum = `📚 排障规则库摘要:\n共 ${troubleshootRules.length} 条规则:\n\n`;
      troubleshootRules.forEach((r) => { sum += `- [${r.ruleId}] ${r.name}: ${r.description}\n`; });
      sum += `\n可用知识库关键词: ${Object.keys(knowledgeBase).join(", ")}`;
      return sum;
    } catch (e) {
      return `规则引擎查询错误: ${e instanceof Error ? e.message : "未知错误"}`;
    }
  },
  {
    name: "rule_engine",
    description: "根据错误码匹配排障规则，或通过关键词搜索知识库获取常见问题解决方案。",
    schema: z.object({
      errorCode: z.string().optional().describe("错误码，如 INSUFFICIENT_BALANCE, CHANNEL_TIMEOUT, RISK_CONTROL"),
      keyword: z.string().optional().describe("搜索关键词，如 支付失败, 超时, 风控"),
    }),
  }
);
