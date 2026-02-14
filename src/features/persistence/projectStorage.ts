import type {
  PatternSize,
  PersistedProject,
  Primitive,
  ProjectState,
  TileShape,
  Tool
} from '../../types/model';

const STORAGE_KEY = 'tile-creator-project-v1';
const VERSION = 1;

interface LoadResult {
  project: ProjectState;
  pattern: PatternSize;
}

function isPoint(value: unknown): value is { x: number; y: number } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const point = value as Record<string, unknown>;
  return typeof point.x === 'number' && typeof point.y === 'number';
}

function isPrimitive(value: unknown): value is Primitive {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const primitive = value as Record<string, unknown>;
  if (primitive.kind === 'line') {
    return (
      typeof primitive.id === 'string' &&
      typeof primitive.color === 'string' &&
      isPoint(primitive.a) &&
      isPoint(primitive.b)
    );
  }

  if (primitive.kind === 'circle') {
    return (
      typeof primitive.id === 'string' &&
      typeof primitive.color === 'string' &&
      isPoint(primitive.center) &&
      typeof primitive.radius === 'number'
    );
  }

  return false;
}

function isTool(value: unknown): value is Tool {
  return (
    value === 'select' ||
    value === 'line' ||
    value === 'circle' ||
    value === 'erase' ||
    value === 'pan'
  );
}

function isTileShape(value: unknown): value is TileShape {
  return value === 'square' || value === 'hex-pointy';
}

function isPattern(value: unknown): value is PatternSize {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const pattern = value as Record<string, unknown>;
  return (
    typeof pattern.columns === 'number' &&
    typeof pattern.rows === 'number' &&
    pattern.columns > 0 &&
    pattern.rows > 0
  );
}

function isProjectState(value: unknown): value is ProjectState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;

  if (typeof state.tile !== 'object' || state.tile === null) {
    return false;
  }
  const tile = state.tile as Record<string, unknown>;

  if (!isTileShape(tile.shape) || typeof tile.size !== 'number') {
    return false;
  }

  if (!Array.isArray(state.primitives) || !state.primitives.every(isPrimitive)) {
    return false;
  }

  if (!isTool(state.activeTool) || typeof state.activeColor !== 'string') {
    return false;
  }

  if (typeof state.history !== 'object' || state.history === null) {
    return false;
  }

  const history = state.history as Record<string, unknown>;
  if (!Array.isArray(history.past)) {
    return false;
  }

  return history.past.every(
    (entry) => Array.isArray(entry) && entry.every(isPrimitive)
  );
}

function parsePersisted(payload: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('Project file is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Project file has invalid format.');
  }

  const persisted = parsed as Record<string, unknown>;
  if (persisted.version !== VERSION) {
    throw new Error('Unsupported project version.');
  }

  if (!isProjectState(persisted.project)) {
    throw new Error('Project state is invalid.');
  }

  if (!isPattern(persisted.pattern)) {
    throw new Error('Pattern dimensions are invalid.');
  }

  return {
    project: persisted.project,
    pattern: persisted.pattern
  };
}

export function saveAutosave(project: ProjectState, pattern: PatternSize): void {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: PersistedProject = {
    version: VERSION,
    project,
    pattern
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadAutosave(): LoadResult | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return parsePersisted(raw);
  } catch {
    return null;
  }
}

export function serializeProject(project: ProjectState, pattern: PatternSize): string {
  const payload: PersistedProject = {
    version: VERSION,
    project,
    pattern
  };

  return JSON.stringify(payload, null, 2);
}

export function deserializeProject(payload: string): LoadResult {
  return parsePersisted(payload);
}
