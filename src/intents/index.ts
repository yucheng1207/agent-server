/**
 * 意图模块入口
 * 本地文件实现；后续接入飞书时在此切换为 FeishuIntentStore，对外接口不变
 */

export type { IntentDefinition, IntentMatch, IntentStep } from "./types.js";
export { loadIntentsFromFile, clearIntentsCache, matchIntent, getAllIntents } from "./store.js";
export { getStepResultParser, parsePaymentTraceSummary, parsePaymentTraceCreationWindow } from "./parsers.js";
