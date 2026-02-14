import { useMemo } from 'react';
import {
  getTilePolygon,
  periodicNeighborOffsets,
  tileBasisVectors,
  translatePoints,
  translatePrimitive
} from '../../geometry';
import { FIXED_STROKE_WIDTH } from '../../state/projectState';
import type { PatternSize, Primitive, TileConfig } from '../../types/model';
import { PrimitiveSvg } from '../editor/PrimitiveSvg';

interface TilingPreviewProps {
  tile: TileConfig;
  primitives: Primitive[];
  pattern: PatternSize;
}

function getCellOffset(tile: TileConfig, col: number, row: number): { x: number; y: number } {
  const { u, v } = tileBasisVectors(tile);
  return {
    x: col * u.x + row * v.x,
    y: col * u.y + row * v.y
  };
}

function polygonPoints(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function computeViewBox(tile: TileConfig, pattern: PatternSize): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const base = getTilePolygon(tile);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < pattern.rows; row += 1) {
    for (let col = 0; col < pattern.columns; col += 1) {
      const offset = getCellOffset(tile, col, row);
      const moved = translatePoints(base, offset);
      for (const point of moved) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
  }

  const margin = tile.size * 0.3;
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2
  };
}

export function TilingPreview(props: TilingPreviewProps): JSX.Element {
  const tilePolygon = useMemo(() => getTilePolygon(props.tile), [props.tile]);
  const viewBox = useMemo(
    () => computeViewBox(props.tile, props.pattern),
    [props.pattern, props.tile]
  );
  const neighbors = useMemo(() => periodicNeighborOffsets(props.tile), [props.tile]);

  return (
    <section className="panel">
      <h2>Pattern Preview</h2>
      <svg
        data-testid="tiling-preview"
        className="preview-canvas"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      >
        <defs>
          {Array.from({ length: props.pattern.rows }, (_, row) =>
            Array.from({ length: props.pattern.columns }, (_, col) => {
              const offset = getCellOffset(props.tile, col, row);
              const points = translatePoints(tilePolygon, offset);
              return (
                <clipPath key={`clip-${col}-${row}`} id={`preview-clip-${col}-${row}`}>
                  <polygon points={polygonPoints(points)} />
                </clipPath>
              );
            })
          )}
        </defs>

        {Array.from({ length: props.pattern.rows }, (_, row) =>
          Array.from({ length: props.pattern.columns }, (_, col) => {
            const offset = getCellOffset(props.tile, col, row);
            const tilePoints = translatePoints(tilePolygon, offset);

            return (
              <g key={`cell-${col}-${row}`} clipPath={`url(#preview-clip-${col}-${row})`}>
                {props.primitives.flatMap((primitive) =>
                  neighbors.map((neighbor, idx) => (
                    <PrimitiveSvg
                      key={`${primitive.id}-${col}-${row}-${idx}`}
                      primitive={translatePrimitive(primitive, {
                        x: offset.x + neighbor.x,
                        y: offset.y + neighbor.y
                      })}
                      strokeWidth={FIXED_STROKE_WIDTH}
                    />
                  ))
                )}
                <polygon className="tile-outline preview-outline" points={polygonPoints(tilePoints)} />
              </g>
            );
          })
        )}
      </svg>
    </section>
  );
}
