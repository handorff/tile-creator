import type {
  Point,
  PatternSize,
  Primitive,
  ProjectState,
  TileConfig,
  TileShape,
  Tool
} from '../types/model';
import { clamp, distance, dot, subtract } from '../utils/math';

const DEFAULT_TILE_SIZE = 120;
export const FIXED_STROKE_WIDTH = 2;

export const DEFAULT_PATTERN: PatternSize = {
  columns: 4,
  rows: 3
};

export const DEFAULT_COLORS = [
  '#0f172a',
  '#14532d',
  '#1d4ed8',
  '#9f1239',
  '#b45309',
  '#111827'
];

export const initialProjectState: ProjectState = {
  tile: {
    shape: 'square',
    size: DEFAULT_TILE_SIZE
  },
  primitives: [],
  activeTool: 'line',
  activeColor: DEFAULT_COLORS[0],
  history: {
    past: [],
    future: []
  }
};

export type ProjectAction =
  | { type: 'set-tool'; tool: Tool }
  | { type: 'set-color'; color: string }
  | { type: 'recolor-primitives'; ids: string[]; color: string }
  | { type: 'set-tile-shape'; shape: TileShape }
  | { type: 'add-primitive'; primitive: Primitive }
  | { type: 'add-primitives'; primitives: Primitive[] }
  | { type: 'update-primitive'; primitive: Primitive }
  | { type: 'update-primitives'; primitives: Primitive[] }
  | { type: 'split-line'; id: string; point: Point; firstId: string; secondId: string }
  | { type: 'erase-primitive'; id: string }
  | { type: 'erase-primitives'; ids: string[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hydrate'; state: ProjectState }
  | { type: 'clear' };

function withHistory(state: ProjectState, description: string): ProjectState {
  return {
    ...state,
    history: {
      past: [...state.history.past, { primitives: state.primitives, description }],
      future: []
    }
  };
}

function describeShapeCount(action: string, count: number): string {
  const shapeLabel = count === 1 ? 'shape' : 'shapes';
  return `${action} ${count} ${shapeLabel}`;
}

function setTileShape(state: ProjectState, shape: TileShape): ProjectState {
  if (state.tile.shape === shape) {
    return state;
  }

  const next = withHistory(state, 'Change tile shape');
  const tile: TileConfig = {
    ...next.tile,
    shape
  };

  return {
    ...next,
    tile,
    primitives: []
  };
}

function addPrimitive(state: ProjectState, primitive: Primitive): ProjectState {
  const next = withHistory(state, primitive.kind === 'line' ? 'Add line' : 'Add circle');
  return {
    ...next,
    primitives: [...state.primitives, primitive]
  };
}

function addPrimitives(state: ProjectState, primitives: Primitive[]): ProjectState {
  if (primitives.length === 0) {
    return state;
  }

  const next = withHistory(state, describeShapeCount('Add', primitives.length));
  return {
    ...next,
    primitives: [...state.primitives, ...primitives]
  };
}

function erasePrimitive(state: ProjectState, id: string): ProjectState {
  return erasePrimitives(state, [id]);
}

function erasePrimitives(state: ProjectState, ids: string[]): ProjectState {
  if (ids.length === 0) {
    return state;
  }

  const selected = new Set(ids);
  const removedCount = state.primitives.reduce(
    (count, primitive) => (selected.has(primitive.id) ? count + 1 : count),
    0
  );
  if (removedCount === 0) {
    return state;
  }

  const next = withHistory(state, describeShapeCount('Erase', removedCount));
  return {
    ...next,
    primitives: state.primitives.filter((primitive) => !selected.has(primitive.id))
  };
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function samePrimitive(a: Primitive, b: Primitive): boolean {
  if (a.kind !== b.kind || a.id !== b.id || a.color !== b.color) {
    return false;
  }

  if (a.kind === 'line' && b.kind === 'line') {
    return samePoint(a.a, b.a) && samePoint(a.b, b.b);
  }

  if (a.kind === 'circle' && b.kind === 'circle') {
    return samePoint(a.center, b.center) && a.radius === b.radius;
  }

  return false;
}

function updatePrimitive(state: ProjectState, primitive: Primitive): ProjectState {
  return updatePrimitives(state, [primitive]);
}

function updatePrimitives(state: ProjectState, primitives: Primitive[]): ProjectState {
  if (primitives.length === 0) {
    return state;
  }

  const updates = new Map(primitives.map((primitive) => [primitive.id, primitive]));
  let changedCount = 0;
  const updatedPrimitives = state.primitives.map((primitive) => {
    const next = updates.get(primitive.id);
    if (!next || samePrimitive(primitive, next)) {
      return primitive;
    }

    changedCount += 1;
    return next;
  });

  if (changedCount === 0) {
    return state;
  }

  const next = withHistory(state, describeShapeCount('Edit', changedCount));
  return {
    ...next,
    primitives: updatedPrimitives
  };
}

function recolorPrimitives(state: ProjectState, ids: string[], color: string): ProjectState {
  if (ids.length === 0) {
    return state;
  }

  const selected = new Set(ids);
  let changedCount = 0;
  const updatedPrimitives = state.primitives.map((primitive) => {
    if (!selected.has(primitive.id) || primitive.color === color) {
      return primitive;
    }

    changedCount += 1;
    return {
      ...primitive,
      color
    };
  });

  if (changedCount === 0) {
    return state;
  }

  const next = withHistory(state, describeShapeCount('Recolor', changedCount));
  return {
    ...next,
    primitives: updatedPrimitives
  };
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const ab = subtract(b, a);
  const ap = subtract(point, a);
  const denom = dot(ab, ab);
  if (denom <= 0) {
    return distance(point, a);
  }

  const t = clamp(dot(ap, ab) / denom, 0, 1);
  const projected = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return distance(point, projected);
}

function splitLine(
  state: ProjectState,
  id: string,
  point: Point,
  firstId: string,
  secondId: string
): ProjectState {
  const index = state.primitives.findIndex((primitive) => primitive.id === id);
  if (index < 0) {
    return state;
  }

  const candidate = state.primitives[index];
  if (candidate.kind !== 'line') {
    return state;
  }

  if (distanceToSegment(point, candidate.a, candidate.b) > 1) {
    return state;
  }

  if (distance(point, candidate.a) <= 1 || distance(point, candidate.b) <= 1) {
    return state;
  }

  const next = withHistory(state, 'Split line');
  const first: Primitive = {
    id: firstId,
    kind: 'line',
    a: candidate.a,
    b: point,
    color: candidate.color
  };
  const second: Primitive = {
    id: secondId,
    kind: 'line',
    a: point,
    b: candidate.b,
    color: candidate.color
  };

  const updated = [...state.primitives];
  updated.splice(index, 1, first, second);

  return {
    ...next,
    primitives: updated
  };
}

function undo(state: ProjectState): ProjectState {
  if (state.history.past.length === 0) {
    return state;
  }

  const past = [...state.history.past];
  const previous = past.pop()!;
  const future = [...state.history.future, { primitives: state.primitives, description: previous.description }];

  return {
    ...state,
    primitives: previous.primitives,
    history: {
      past,
      future
    }
  };
}

function redo(state: ProjectState): ProjectState {
  if (state.history.future.length === 0) {
    return state;
  }

  const future = [...state.history.future];
  const next = future.pop()!;
  const past = [...state.history.past, { primitives: state.primitives, description: next.description }];

  return {
    ...state,
    primitives: next.primitives,
    history: {
      past,
      future
    }
  };
}

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'set-tool':
      return {
        ...state,
        activeTool: action.tool
      };
    case 'set-color':
      return {
        ...state,
        activeColor: action.color
      };
    case 'recolor-primitives':
      return recolorPrimitives(state, action.ids, action.color);
    case 'set-tile-shape':
      return setTileShape(state, action.shape);
    case 'add-primitive':
      return addPrimitive(state, action.primitive);
    case 'add-primitives':
      return addPrimitives(state, action.primitives);
    case 'update-primitive':
      return updatePrimitive(state, action.primitive);
    case 'update-primitives':
      return updatePrimitives(state, action.primitives);
    case 'split-line':
      return splitLine(state, action.id, action.point, action.firstId, action.secondId);
    case 'erase-primitive':
      return erasePrimitive(state, action.id);
    case 'erase-primitives':
      return erasePrimitives(state, action.ids);
    case 'undo':
      return undo(state);
    case 'redo':
      return redo(state);
    case 'hydrate':
      return action.state;
    case 'clear': {
      const next = withHistory(state, 'Clear tile');
      return {
        ...next,
        primitives: []
      };
    }
    default:
      return state;
  }
}
