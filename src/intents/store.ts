/**
 * 意图存储：当前从本地 JSON 读取，后续可替换为飞书文档等
 * 对外接口保持不变，便于接入飞书后只改实现
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { IntentDefinition, IntentMatch } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedIntents: IntentDefinition[] | null = null;

/** 从本地文件加载意图列表（开发时可改为 watch 热更新，生产可缓存） */
export function loadIntentsFromFile(): IntentDefinition[] {
  if (cachedIntents) return cachedIntents;
  const path = join(__dirname, "intents.json");
  const raw = readFileSync(path, "utf-8");
  cachedIntents = JSON.parse(raw) as IntentDefinition[];
  return cachedIntents;
}

/** 清除缓存（飞书接入后可按需刷新） */
export function clearIntentsCache(): void {
  cachedIntents = null;
}

/**
 * 根据用户问题匹配意图（当前为关键词包含，后续可扩展正则或相似度）
 * 返回第一个命中的意图及从 context / 消息中解析出的参数
 */
export function matchIntent(
  question: string,
  context?: Record<string, unknown>
): IntentMatch | null {
  const intents = loadIntentsFromFile();
  const trimmed = question.trim();

  for (const intent of intents) {
    const hit = intent.keywords.some((kw) => trimmed.includes(kw));
    if (!hit) continue;

    const resolvedParams: Record<string, string> = {};
    if (intent.paramFromContext?.length) {
      for (const key of intent.paramFromContext) {
        const v = context?.[key];
        if (v != null && typeof v === "string") resolvedParams[key] = v;
      }
    }
    // 若 context 无 orderId，尝试从消息中提取订单号（纯数字，常见 16 位）
    if (intent.paramFromContext?.includes("orderId") && !resolvedParams.orderId) {
      const m = trimmed.match(/\b(\d{14,20})\b/);
      if (m) resolvedParams.orderId = m[1];
    }

    // 必须能解析出 orderId 才认为可执行该意图
    if (intent.toolSequence.some((s) => JSON.stringify(s.params).includes("orderId")) && !resolvedParams.orderId) {
      continue;
    }

    return { intent, resolvedParams };
  }
  return null;
}

/** 获取所有意图（供管理/飞书同步等） */
export function getAllIntents(): IntentDefinition[] {
  return loadIntentsFromFile();
}
