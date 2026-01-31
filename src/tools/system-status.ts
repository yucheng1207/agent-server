/**
 * 系统状态检查工具（与 agent-demo 对齐）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { SystemStatus } from "../types.js";

const mockSystemStatus: SystemStatus[] = [
  { service: "payment-gateway", status: "healthy", latency: 45, lastChecked: new Date(), details: "主支付网关运行正常" },
  { service: "alipay-channel", status: "healthy", latency: 180, lastChecked: new Date(), details: "支付宝渠道连接正常" },
  { service: "wechat-channel", status: "degraded", latency: 450, lastChecked: new Date(), details: "微信支付渠道响应较慢" },
  { service: "visa-channel", status: "down", latency: 0, lastChecked: new Date(), details: "VISA 渠道连接超时" },
];

async function getAllSystemStatus(): Promise<SystemStatus[]> {
  await new Promise((r) => setTimeout(r, 50));
  return mockSystemStatus.map((s) => ({ ...s, lastChecked: new Date() }));
}

async function getServiceStatus(serviceName: string): Promise<SystemStatus | null> {
  await new Promise((r) => setTimeout(r, 50));
  const s = mockSystemStatus.find((x) => x.service.toLowerCase().includes(serviceName.toLowerCase()));
  return s ? { ...s, lastChecked: new Date() } : null;
}

function formatSystemStatus(s: SystemStatus): string {
  const emoji: Record<string, string> = { healthy: "✅", degraded: "⚠️", down: "❌" };
  const text: Record<string, string> = { healthy: "健康", degraded: "降级", down: "故障" };
  return `${emoji[s.status]} ${s.service}\n状态: ${text[s.status]}\n延迟: ${s.latency}ms\n详情: ${s.details ?? ""}`;
}

function generateSummary(statuses: SystemStatus[]): string {
  const healthy = statuses.filter((s) => s.status === "healthy").length;
  const degraded = statuses.filter((s) => s.status === "degraded").length;
  const down = statuses.filter((s) => s.status === "down").length;
  let sum = `📊 系统状态摘要:\n- 总服务数: ${statuses.length}\n- ✅ 健康: ${healthy}\n- ⚠️ 降级: ${degraded}\n- ❌ 故障: ${down}\n\n📋 详情:\n`;
  statuses.forEach((s) => { sum += formatSystemStatus(s) + "\n"; });
  return sum;
}

export const systemStatusTool = tool(
  async ({ serviceName }) => {
    try {
      if (serviceName) {
        const s = await getServiceStatus(serviceName);
        if (s) return `🔍 服务 "${serviceName}" 状态:\n${formatSystemStatus(s)}`;
        return `未找到服务: ${serviceName}`;
      }
      const all = await getAllSystemStatus();
      return generateSummary(all);
    } catch (e) {
      return `检查系统状态时发生错误: ${e instanceof Error ? e.message : "未知错误"}`;
    }
  },
  {
    name: "system_status",
    description: "检查支付系统各组件的健康状态。可查看所有服务或指定服务名称。包括支付网关、数据库、缓存、支付渠道等。",
    schema: z.object({
      serviceName: z.string().optional().describe("服务名称，如 payment-gateway, alipay-channel。不填则查看所有"),
    }),
  }
);
