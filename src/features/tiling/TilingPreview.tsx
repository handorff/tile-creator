import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
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
import type { Point } from '../../types/model';
import { PrimitiveSvg } from '../editor/PrimitiveSvg';
import { renderedViewBoxLayout } from '../editor/coordinates';

interface TilingPreviewProps {
  tile: TileConfig;
  primitives: Primitive[];
  pattern: PatternSize;
  zoom: number;
  showPatternBounds: boolean;
}

interface PanDragState {
  clientX: number;
  clientY: number;
  startOffset: Point;
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

function computeViewBox(tile: TileConfig, pattern: PatternSize, zoom: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { minX, minY, maxX, maxY } = getPatternBounds(tile, pattern);
  const margin = tile.size * 0.3;
  const width = maxX - minX + margin * 2;
  const height = maxY - minY + margin * 2;
  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;
  const scaledWidth = width / zoom;
  const scaledHeight = height / zoom;

  return {
    x: centerX - scaledWidth / 2,
    y: centerY - scaledHeight / 2,
    width: scaledWidth,
    height: scaledHeight
  };
}

function capturePointer(target: SVGSVGElement, pointerId: number): void {
  if (typeof target.setPointerCapture === 'function') {
    target.setPointerCapture(pointerId);
  }
}

function releasePointer(target: SVGSVGElement, pointerId: number): void {
  if (
    typeof target.hasPointerCapture === 'function' &&
    typeof target.releasePointerCapture === 'function' &&
    target.hasPointerCapture(pointerId)
  ) {
    target.releasePointerCapture(pointerId);
  }
}

export function TilingPreview(props: TilingPreviewProps): JSX.Element {
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);
  const tilePolygon = useMemo(() => getTilePolygon(props.tile), [props.tile]);
  const bounds = useMemo(() => getPatternBounds(props.tile, props.pattern), [props.pattern, props.tile]);
  const zoomedViewBox = useMemo(
    () => computeViewBox(props.tile, props.pattern, props.zoom),
    [props.pattern, props.tile, props.zoom]
  );
  const viewBox = useMemo(
    () => ({
      x: zoomedViewBox.x + panOffset.x,
      y: zoomedViewBox.y + panOffset.y,
      width: zoomedViewBox.width,
      height: zoomedViewBox.height
    }),
    [panOffset, zoomedViewBox]
  );
  const neighbors = useMemo(() => periodicNeighborOffsets(props.tile), [props.tile]);

  useEffect(() => {
    setPanDrag(null);
  }, [props.pattern, props.tile, props.zoom]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    setPanDrag({
      clientX: event.clientX,
      clientY: event.clientY,
      startOffset: panOffset
    });
    capturePointer(event.currentTarget, event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!panDrag) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const rendered = renderedViewBoxLayout(rect, viewBox);
    const deltaX = event.clientX - panDrag.clientX;
    const deltaY = event.clientY - panDrag.clientY;
    const worldDeltaX = (deltaX / rendered.width) * viewBox.width;
    const worldDeltaY = (deltaY / rendered.height) * viewBox.height;

    setPanOffset({
      x: panDrag.startOffset.x - worldDeltaX,
      y: panDrag.startOffset.y - worldDeltaY
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!panDrag) {
      releasePointer(event.currentTarget, event.pointerId);
      return;
    }

    setPanDrag(null);
    releasePointer(event.currentTarget, event.pointerId);
  };

  return (
    <section className="canvas-panel">
      <h2>Pattern Preview</h2>
      <svg
        data-testid="tiling-preview"
        className={`preview-canvas${panDrag ? ' panning' : ''}`}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
