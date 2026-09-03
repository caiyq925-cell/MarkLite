import type { Decoration } from "@codemirror/view";

/**
 * 行级 Gutter 标记数据
 */
export interface GutterItem {
  from: number;
  to: number;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  kind: "heading" | "list" | "blockquote";
}

/**
 * 状态栏信息负载
 */
export interface StatusPayload {
  line: number;
  col: number;
  formats: Array<"bold" | "italic" | "code" | "aside" | "heading" | "list">;
  fenceLength?: number;
  rawSnippet: string;
  context?: string;
  asideHidden?: boolean;
  mediaError?: string;
}

/**
 * 实体识别命中结果
 */
export interface EntityHit {
  from: number;
  to: number;
  kind: "class" | "method" | "table";
  content: string;
}

/**
 * 旁白范围
 */
export interface AsideSpan {
  from: number;
  to: number;
  innerFrom: number;
  innerTo: number;
  content: string;
  overlong: boolean;
}

/**
 * 实体着色强度
 */
export type EntityIntensity = "aggressive" | "conservative";

/**
 * 应用配置（扩展原有 AppConfig）
 */
export interface AppConfig {
  splitRatio: number;
  blockRemoteImages: boolean;
  window?: { x: number; y: number; w: number; h: number; maximized: boolean } | null;
  entityIntensity: EntityIntensity;
  entityBlacklist: string[];
}

/**
 * 行内围栏状态
 */
export type FenceState = "idle" | "caretInBlock" | "selected" | "chipEdge";

/**
 * 行内围栏块
 */
export interface FenceBlock {
  from: number;
  to: number;
  kind: "bold" | "italic" | "code";
  state: FenceState;
}
