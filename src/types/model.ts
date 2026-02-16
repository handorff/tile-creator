export type TileShape = 'square' | 'hex-pointy';

export type Tool = 'select' | 'line' | 'circle' | 'arc' | 'erase' | 'pan';

export interface Point {
  x: number;
  y: number;
}

export interface LinePrimitive {
  id: string;
  kind: 'line';
  a: Point;
  b: Point;
  color: string;
  strokeWidth?: number;
}

export interface CirclePrimitive {
  id: string;
  kind: 'circle';
  center: Point;
  radius: number;
  color: string;
  strokeWidth?: number;
}

export interface ArcPrimitive {
  id: string;
  kind: 'arc';
  center: Point;
  start: Point;
  end: Point;
  clockwise: boolean;
  largeArc: boolean;
  color: string;
  strokeWidth?: number;
}

export type Primitive = LinePrimitive | CirclePrimitive | ArcPrimitive;

export interface TileConfig {
  shape: TileShape;
  size: number;
}

export interface PatternSize {
  columns: number;
  rows: number;
}

export interface HistoryEntry {
  primitives: Primitive[];
  description: string;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export interface ProjectState {
  tile: TileConfig;
  primitives: Primitive[];
  activeTool: Tool;
  activeColor: string;
  activeStrokeWidth: number;
  history: HistoryState;
}

export interface ExportOptions {
  pattern: PatternSize;
  background?: string;
}

export interface PersistedProject {
  version: number;
  project: ProjectState;
  pattern: PatternSize;
}
