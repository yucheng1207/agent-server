/**
 * 支付链路追踪工具（通过 MCP HTTP JSON-RPC，与 agent-demo 对齐）
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { MCP_SERVER_URL } from "../config.js";

let requestId = 0;

async function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(MCP_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id: ++requestId,
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP 服务请求失败: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(`MCP 服务错误: ${result.error.message || JSON.stringify(result.error)}`);
  }
  return result.result;
}

function extractMcpText(result: unknown): string {
  if (!result) return "";
  try {
    const res = result as Record<string, unknown>;
    if (Array.isArray(res.content)) {
      for (const item of res.content as Array<{ type?: string; text?: string }>) {
        if (item.type === "text" && item.text) {
          try {
            const jsonData = JSON.parse(item.text);
            if (jsonData.result && Array.isArray(jsonData.result)) return jsonData.result.join("\n");
          } catch {
            return item.text;
          }
        }
      }
    }
  } catch (e) {
    console.error("提取 MCP 文本失败:", e);
  }
  return "";
}

export const paymentTraceTool = tool(
  async ({ orderId }) => {
    if (!orderId) return "请提供订单号进行支付链路查询";
    try {
      const result = await callMcpTool("trace_payment", { orderId });
      const text = extractMcpText(result);
      if (!text) return `订单 ${orderId} 未查询到支付链路数据`;
      return text;
    } catch (e) {
      return `查询支付链路失败: ${e instanceof Error ? e.message : "未知错误"}`;
    }
  },
  {
    name: "payment_trace",
    description:
      "查询订单的完整支付链路数据。返回订单信息、支付追踪详情（包含 PageTraceId、进入收银台时间等）、支付结果、告警和链路分析。这是排查问题的首选工具。",
    schema: z.object({
      orderId: z.string().describe("订单号，如 1433808485289061"),
    }),
  }
);
