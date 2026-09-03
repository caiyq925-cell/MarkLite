export type EncodingKind = "utf-8" | "gbk";
export type Newline = "lf" | "crlf";

export interface ReadFileResult {
  text: string;
  encoding: EncodingKind;
  bom: boolean;
  newline: Newline;
  size: number;
  path: string;
}

export interface WriteFileRequest {
  path: string;
  text: string;
  bom: boolean;
  newline: Newline;
}

export interface WindowGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
}

export type EntityIntensity = "aggressive" | "conservative";

export interface AppConfig {
  window?: WindowGeom | null;
  splitRatio: number;
  blockRemoteImages: boolean;
  entityIntensity: EntityIntensity;
  entityBlacklist: string[];
}

export interface DocumentTab {
  id: string;
  path: string;
  title: string;
  text: string;
  lastSavedText: string;
  encoding: EncodingKind;
  bom: boolean;
  newline: Newline;
  dirty: boolean;
  size: number;
  readonlyPlain: boolean;
}

export interface Heading {
  level: number;
  text: string;
  id: string;
  sourceLine: number;
}
