/**
 * 意图定义类型
 * 后续接入飞书文档时，可从此结构序列化/反序列化，接口保持不变
 */

/** 单步工具调用：tool 为工具名，params 中可使用占位符 {{orderId}} {{pageTraceId}} {{fromDate}} {{toDate}} 等 */
export interface IntentStep {
  tool: string;
  params: Record<string, string | number | boolean>;
}

/** 意图定义：与本地 JSON / 飞书文档字段对齐 */
export interface IntentDefinition {
  /** 唯一标识 */
  id: string;
  /** 展示名 */
  name: string;
  /** 触发关键词：用户问题包含任一即视为命中（后续可扩展为正则或相似度） */
  keywords: string[];
  /** 工具调用顺序；params 占位符由运行时从 context 或上一步解析结果填充 */
  toolSequence: IntentStep[];
  /** 从 context 取值的参数名，如 orderId；若 context 无则尝试从用户消息中提取 */
  paramFromContext?: string[];
  /** 某步工具结果的解析器名，用于填充下一步占位符，如 { "payment_trace": "payment_trace_summary" } */
  stepResultParsers?: Record<string, string>;
  /** 总结回答时的指引：如何基于工具结果组织回答 */
  answerInstruction: string;
}

/** 匹配到的意图（含解析出的 orderId 等） */
export interface IntentMatch {
  intent: IntentDefinition;
  /** 从 context 或消息中解析出的参数 */
  resolvedParams: Record<string, string>;
}
