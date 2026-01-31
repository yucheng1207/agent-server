/**
 * 支付渠道诊断工具（与 agent-demo 对齐）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { PaymentChannel } from "../types.js";

const mockChannels: PaymentChannel[] = [
  { channelId: "alipay_app", name: "支付宝APP支付", status: "active", supportedMethods: ["balance", "card", "huabei"], successRate: 99.2, avgLatency: 180 },
  { channelId: "wechat_h5", name: "微信H5支付", status: "maintenance", supportedMethods: ["balance", "card"], successRate: 95, avgLatency: 450 },
  { channelId: "visa", name: "VISA信用卡", status: "inactive", supportedMethods: ["credit_card"], successRate: 0, avgLatency: 0 },
];

async function getAllChannels(): Promise<PaymentChannel[]> {
  await new Promise((r) => setTimeout(r, 50));
  return mockChannels;
}

async function getChannelById(channelId: string): Promise<PaymentChannel | null> {
  await new Promise((r) => setTimeout(r, 50));
  return mockChannels.find((c) => c.channelId.toLowerCase() === channelId.toLowerCase() || c.name.includes(channelId)) ?? null;
}

async function getChannelsByMethod(method: string): Promise<PaymentChannel[]> {
  await new Promise((r) => setTimeout(r, 50));
  return mockChannels.filter((c) => c.status === "active" && c.supportedMethods.includes(method));
}

function formatChannel(c: PaymentChannel): string {
  const emoji: Record<string, string> = { active: "✅", inactive: "❌", maintenance: "🔧" };
  const text: Record<string, string> = { active: "正常", inactive: "停用", maintenance: "维护中" };
  return `${emoji[c.status]} ${c.name} (${c.channelId})\n状态: ${text[c.status]}\n支持方式: ${c.supportedMethods.join(", ")}\n成功率: ${c.successRate}%\n平均延迟: ${c.avgLatency}ms`;
}

export const payChannelTool = tool(
  async ({ channelId, paymentMethod }) => {
    try {
      if (channelId) {
        const c = await getChannelById(channelId);
        if (c) return `🔍 渠道详情:\n${formatChannel(c)}`;
        return `未找到渠道: ${channelId}`;
      }
      if (paymentMethod) {
        const list = await getChannelsByMethod(paymentMethod);
        if (list.length) return `🔍 支持 "${paymentMethod}" 的渠道:\n${list.map(formatChannel).join("\n")}`;
        return `没有支持 "${paymentMethod}" 的可用渠道`;
      }
      const all = await getAllChannels();
      let sum = `📊 支付渠道摘要:\n- 总渠道数: ${all.length}\n\n📋 详情:\n`;
      all.forEach((c) => { sum += formatChannel(c) + "\n"; });
      return sum;
    } catch (e) {
      return `查询支付渠道时发生错误: ${e instanceof Error ? e.message : "未知错误"}`;
    }
  },
  {
    name: "pay_channel",
    description: "查询支付渠道状态和配置。可查看所有渠道或按渠道ID/支付方式查询。包括可用性、成功率、延迟等。",
    schema: z.object({
      channelId: z.string().optional().describe("渠道ID，如 alipay_app, wechat_h5, visa"),
      paymentMethod: z.string().optional().describe("支付方式，如 balance, card, credit_card"),
    }),
  }
);
