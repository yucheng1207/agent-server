/**
 * 订单查询工具（与 agent-demo 对齐）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

const mockOrders: Record<string, { orderId: string; userId: string; amount: number; currency: string; status: string; paymentMethod: string; paymentChannel: string; createdAt: string; updatedAt: string; errorCode?: string; errorMessage?: string }> = {
  "ORD-001": { orderId: "ORD-001", userId: "USER-123", amount: 99.99, currency: "CNY", status: "failed", paymentMethod: "alipay", paymentChannel: "alipay_app", createdAt: "2024-01-15T10:30:00Z", updatedAt: "2024-01-15T10:30:05Z", errorCode: "INSUFFICIENT_BALANCE", errorMessage: "用户账户余额不足" },
  "ORD-002": { orderId: "ORD-002", userId: "USER-123", amount: 199, currency: "CNY", status: "success", paymentMethod: "wechat", paymentChannel: "wechat_h5", createdAt: "2024-01-14T15:20:00Z", updatedAt: "2024-01-14T15:20:10Z" },
};

function formatOrder(o: typeof mockOrders[string]): string {
  let r = `\n📋 订单详情:\n- 订单号: ${o.orderId}\n- 用户ID: ${o.userId}\n- 金额: ${o.currency} ${o.amount}\n- 状态: ${o.status}\n- 支付方式: ${o.paymentMethod}\n- 支付渠道: ${o.paymentChannel}\n- 创建时间: ${o.createdAt}\n- 更新时间: ${o.updatedAt}`;
  if (o.errorCode) r += `\n- 错误码: ${o.errorCode}\n- 错误信息: ${o.errorMessage ?? ""}`;
  return r;
}

async function queryOrderById(orderId: string) {
  await new Promise((r) => setTimeout(r, 50));
  return mockOrders[orderId] ?? null;
}

export const orderQueryTool = tool(
  async ({ orderId, userId }) => {
    try {
      if (orderId) {
        const order = await queryOrderById(orderId);
        if (order) return formatOrder(order);
        return `未找到订单号为 ${orderId} 的订单`;
      }
      if (userId) {
        const orders = Object.values(mockOrders).filter((o) => o.userId === userId);
        if (orders.length) return `找到 ${orders.length} 个订单:\n${orders.map(formatOrder).join("\n---\n")}`;
        return `未找到用户 ${userId} 的订单`;
      }
      return "请提供订单号(orderId)或用户ID(userId)进行查询";
    } catch (e) {
      return `查询订单时发生错误: ${e instanceof Error ? e.message : "未知错误"}`;
    }
  },
  {
    name: "order_query",
    description: "查询支付订单信息。可根据订单号(orderId)或用户ID(userId)查询订单详情，包括订单状态、金额、支付方式、错误信息等。",
    schema: z.object({
      orderId: z.string().optional().describe("订单号，如 ORD-001"),
      userId: z.string().optional().describe("用户ID，如 USER-123"),
    }),
  }
);
