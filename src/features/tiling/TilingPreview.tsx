import { useMemo } from 'react';
import {
  getPatternBounds,
  PATTERN_BOUNDS_STROKE,
  getTilePolygon,
  periodicNeighborOffsets,
  tileBasisVectors,
  translatePoints,
  translatePrimitive
} from '../../geometry';
import type { PatternSize, Primitive, TileConfig } from '../../types/model';
import { PrimitiveSvg } from '../editor/PrimitiveSvg';

interface TilingPreviewProps {
  tile: TileConfig;
  primitives: Primitive[];
  pattern: PatternSize;
  showPatternBounds: boolean;
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
  const { minX, minY, maxX, maxY } = getPatternBounds(tile, pattern);
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
  const bounds = useMemo(() => getPatternBounds(props.tile, props.pattern), [props.pattern, props.tile]);
  const viewBox = useMemo(
    () => computeViewBox(props.tile, props.pattern),
    [props.pattern, props.tile]
  );
  const neighbors = useMemo(() => periodicNeighborOffsets(props.tile), [props.tile]);

  return (
    <section className="canvas-panel">
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
                    />
                  ))
                )}
                <polygon className="tile-outline preview-outline" points={polygonPoints(tilePoints)} />
              </g>
            );
          })
        )}
        {props.showPatternBounds ? (
          <rect
            className="pattern-bounds"
            x={bounds.minX}
            y={bounds.minY}
            width={bounds.maxX - bounds.minX}
            height={bounds.maxY - bounds.minY}
            fill="none"
            stroke={PATTERN_BOUNDS_STROKE}
            strokeWidth={2}
          />
        ) : null}
      </svg>
    </section>
  );
}
