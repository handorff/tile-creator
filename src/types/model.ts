export type TileShape = 'square' | 'hex-pointy';

export type Tool = 'select' | 'line' | 'circle' | 'split' | 'erase' | 'pan';

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
}

export interface CirclePrimitive {
  id: string;
  kind: 'circle';
  center: Point;
  radius: number;
  color: string;
}

export type Primitive = LinePrimitive | CirclePrimitive;

export interface TileConfig {
  shape: TileShape;
  size: number;
}

export interface PatternSize {
  columns: number;
  rows: number;
}

export interface HistoryState {
  past: Primitive[][];
}

export interface ProjectState {
  tile: TileConfig;
  primitives: Primitive[];
  activeTool: Tool;
  activeColor: string;
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
