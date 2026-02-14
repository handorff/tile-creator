import type { PatternSize, Point, Primitive, TileConfig } from '../types/model';
import { tileBasisVectors } from './tile';

export function translatePrimitive(primitive: Primitive, offset: Point): Primitive {
  if (primitive.kind === 'line') {
    return {
      ...primitive,
      a: { x: primitive.a.x + offset.x, y: primitive.a.y + offset.y },
      b: { x: primitive.b.x + offset.x, y: primitive.b.y + offset.y }
    };
  }

  return {
    ...primitive,
    center: { x: primitive.center.x + offset.x, y: primitive.center.y + offset.y }
  };
}

export function replicatePattern(
  primitives: Primitive[],
  tileConfig: TileConfig,
  patternSize: PatternSize
): Primitive[] {
  const { u, v } = tileBasisVectors(tileConfig);
  const out: Primitive[] = [];

  for (let row = 0; row < patternSize.rows; row += 1) {
    for (let col = 0; col < patternSize.columns; col += 1) {
      const offset = {
        x: col * u.x + row * v.x,
        y: col * u.y + row * v.y
      };

      for (const primitive of primitives) {
        out.push(translatePrimitive(primitive, offset));
      }
    }
  }

  return out;
}
