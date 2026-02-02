/**
 * LangGraph 编排：意图分类 → 意图链 / 无意图直接 END（ReAct 在 agent 层流式执行）
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { GraphStateAnnotation, type GraphState } from "./state.js";
import {
  classifyIntentNode,
  runIntentChainNode,
  summarizeIntentNode,
  noIntentNode,
  type NodeConfig,
} from "./nodes.js";

type State = typeof GraphStateAnnotation.State;

/** 路由：有意图走意图链，否则走 noIntent → END（agent 层再流式跑 ReAct） */
function routeAfterClassify(state: State): "runIntentChain" | "noIntent" {
  return state.intentMatch ? "runIntentChain" : "noIntent";
}

/**
 * 创建编译后的图
 * config 在 invoke/stream 时传入 configurable；无意图时 ReAct 在 agent 层用 stream 流式产出
 */
export function createIntentGraph() {
  const graph = new StateGraph(GraphStateAnnotation)
    .addNode("classifyIntent", classifyIntentNode)
    .addNode("runIntentChain", runIntentChainNode)
    .addNode("summarizeIntent", summarizeIntentNode)
    .addNode("noIntent", noIntentNode)
    .addEdge(START, "classifyIntent")
    .addConditionalEdges("classifyIntent", routeAfterClassify, ["runIntentChain", "noIntent"])
    .addEdge("runIntentChain", "summarizeIntent")
    .addEdge("summarizeIntent", END)
    .addEdge("noIntent", END);

  return graph.compile();
}

export type { GraphState, NodeConfig };
export { initialGraphState, GraphStateAnnotation } from "./state.js";
export { classifyIntentNode, runIntentChainNode, summarizeIntentNode, noIntentNode } from "./nodes.js";
