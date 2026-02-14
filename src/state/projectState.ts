import type {
  PatternSize,
  Primitive,
  ProjectState,
  TileConfig,
  TileShape,
  Tool
} from '../types/model';

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
    past: []
  }
};

export type ProjectAction =
  | { type: 'set-tool'; tool: Tool }
  | { type: 'set-color'; color: string }
  | { type: 'set-tile-shape'; shape: TileShape }
  | { type: 'add-primitive'; primitive: Primitive }
  | { type: 'update-primitive'; primitive: Primitive }
  | { type: 'erase-primitive'; id: string }
  | { type: 'undo' }
  | { type: 'hydrate'; state: ProjectState }
  | { type: 'clear' };

function withHistory(state: ProjectState): ProjectState {
  return {
    ...state,
    history: {
      past: [...state.history.past, state.primitives]
    }
  };
}

function setTileShape(state: ProjectState, shape: TileShape): ProjectState {
  if (state.tile.shape === shape) {
    return state;
  }

  const next = withHistory(state);
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
  const next = withHistory(state);
  return {
    ...next,
    primitives: [...state.primitives, primitive]
  };
}

function erasePrimitive(state: ProjectState, id: string): ProjectState {
  const exists = state.primitives.some((primitive) => primitive.id === id);
  if (!exists) {
    return state;
  }

  const next = withHistory(state);
  return {
    ...next,
    primitives: state.primitives.filter((primitive) => primitive.id !== id)
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
  const index = state.primitives.findIndex((candidate) => candidate.id === primitive.id);
  if (index < 0) {
    return state;
  }

  if (samePrimitive(state.primitives[index], primitive)) {
    return state;
  }

  const next = withHistory(state);
  const updatedPrimitives = [...state.primitives];
  updatedPrimitives[index] = primitive;

  return {
    ...next,
    primitives: updatedPrimitives
  };
}

function undo(state: ProjectState): ProjectState {
  if (state.history.past.length === 0) {
    return state;
  }

  const past = [...state.history.past];
  const previous = past.pop()!;

  return {
    ...state,
    primitives: previous,
    history: {
      past
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
    case 'set-tile-shape':
      return setTileShape(state, action.shape);
    case 'add-primitive':
      return addPrimitive(state, action.primitive);
    case 'update-primitive':
      return updatePrimitive(state, action.primitive);
    case 'erase-primitive':
      return erasePrimitive(state, action.id);
    case 'undo':
      return undo(state);
    case 'hydrate':
      return action.state;
    case 'clear':
      return {
        ...state,
        primitives: [],
        history: {
          past: [...state.history.past, state.primitives]
        }
      };
    default:
      return state;
  }
}
