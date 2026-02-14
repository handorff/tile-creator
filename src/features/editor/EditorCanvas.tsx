import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  gatherSnapPoints,
  getLinePassThroughSnap,
  getSnapPoint,
  getTilePolygon,
  hitTestPrimitive,
  periodicNeighborOffsets,
  polygonBounds,
  translatePrimitive
} from '../../geometry';
import { FIXED_STROKE_WIDTH } from '../../state/projectState';
import type { Point, Primitive, TileConfig, Tool } from '../../types/model';
import { createId } from '../../utils/ids';
import { distance } from '../../utils/math';
import { PrimitiveSvg } from './PrimitiveSvg';

interface EditorCanvasProps {
  tile: TileConfig;
  primitives: Primitive[];
  activeTool: Tool;
  activeColor: string;
  zoom: number;
  onAddPrimitive: (primitive: Primitive) => void;
  onUpdatePrimitive: (primitive: Primitive) => void;
  onErasePrimitive: (id: string) => void;
}

type DraftState =
  | { kind: 'line'; start: Point; end: Point }
  | { kind: 'circle'; center: Point; radius: number }
  | null;

type EditHandle = 'line-a' | 'line-b' | 'circle-center' | 'circle-radius';

interface EditDragState {
  primitiveId: string;
  handle: EditHandle;
  preview: Primitive;
}

interface PanDragState {
  clientX: number;
  clientY: number;
  startOffset: Point;
}

const DRAW_MIN_DISTANCE = 1;

function viewBoxForTile(tile: TileConfig): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const polygon = getTilePolygon(tile);
  const neighbors = periodicNeighborOffsets(tile);

  const points: Point[] = [...polygon];
  for (const offset of neighbors) {
    for (const point of polygon) {
      points.push({
        x: point.x + offset.x,
        y: point.y + offset.y
      });
    }
  }

  const bounds = polygonBounds(points);
  const margin = tile.size * 0.5;

  return {
    x: bounds.minX - margin,
    y: bounds.minY - margin,
    width: bounds.maxX - bounds.minX + margin * 2,
    height: bounds.maxY - bounds.minY + margin * 2
  };
}

function zoomViewBox(
  viewBox: { x: number; y: number; width: number; height: number },
  zoom: number
): { x: number; y: number; width: number; height: number } {
  const clampedZoom = Math.min(10, Math.max(0.5, zoom));
  const width = viewBox.width / clampedZoom;
  const height = viewBox.height / clampedZoom;
  return {
    x: viewBox.x + (viewBox.width - width) / 2,
    y: viewBox.y + (viewBox.height - height) / 2,
    width,
    height
  };
}

function toWorldPoint(
  event: ReactPointerEvent<SVGSVGElement>,
  viewBox: { x: number; y: number; width: number; height: number }
): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x;
  const y = ((event.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y;
  return { x, y };
}

function polygonPath(points: Point[]): string {
  if (points.length === 0) {
    return '';
  }

  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')} Z`;
}

function circleRadiusHandle(circle: Extract<Primitive, { kind: 'circle' }>): Point {
  return {
    x: circle.center.x + circle.radius,
    y: circle.center.y
  };
}

function editHandleAtPoint(point: Point, primitive: Primitive, tolerance: number): EditHandle | null {
  if (primitive.kind === 'line') {
    if (distance(point, primitive.a) <= tolerance) {
      return 'line-a';
    }
    if (distance(point, primitive.b) <= tolerance) {
      return 'line-b';
    }
    return null;
  }

  if (distance(point, primitive.center) <= tolerance) {
    return 'circle-center';
  }

  if (distance(point, circleRadiusHandle(primitive)) <= tolerance) {
    return 'circle-radius';
  }

  return null;
}

function applyEditHandle(preview: Primitive, handle: EditHandle, point: Point): Primitive {
  if (preview.kind === 'line' && handle === 'line-a') {
    return { ...preview, a: point };
  }

  if (preview.kind === 'line' && handle === 'line-b') {
    return { ...preview, b: point };
  }

  if (preview.kind === 'circle' && handle === 'circle-center') {
    return { ...preview, center: point };
  }

  if (preview.kind === 'circle' && handle === 'circle-radius') {
    return {
      ...preview,
      radius: Math.max(DRAW_MIN_DISTANCE, distance(preview.center, point))
    };
  }

  return preview;
}

export function EditorCanvas(props: EditorCanvasProps): JSX.Element {
  const [draft, setDraft] = useState<DraftState>(null);
  const [drawing, setDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDrag, setEditDrag] = useState<EditDragState | null>(null);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);
  const baseViewBox = useMemo(() => viewBoxForTile(props.tile), [props.tile]);
  const zoomedViewBox = useMemo(() => zoomViewBox(baseViewBox, props.zoom), [baseViewBox, props.zoom]);
  const viewBox = useMemo(
    () => ({
      x: zoomedViewBox.x + panOffset.x,
      y: zoomedViewBox.y + panOffset.y,
      width: zoomedViewBox.width,
      height: zoomedViewBox.height
    }),
    [zoomedViewBox, panOffset]
  );
  const tilePolygon = useMemo(() => getTilePolygon(props.tile), [props.tile]);
  const tilePath = useMemo(() => polygonPath(tilePolygon), [tilePolygon]);
  const periodicOffsets = useMemo(() => periodicNeighborOffsets(props.tile), [props.tile]);

  useEffect(() => {
    if (selectedId && !props.primitives.some((primitive) => primitive.id === selectedId)) {
      setSelectedId(null);
      setEditDrag(null);
    }
  }, [props.primitives, selectedId]);

  useEffect(() => {
    if (props.activeTool !== 'select') {
      setSelectedId(null);
      setEditDrag(null);
    }
  }, [props.activeTool]);

  useEffect(() => {
    if (props.activeTool !== 'pan') {
      setPanDrag(null);
    }
  }, [props.activeTool]);

  const renderedPrimitives = useMemo(() => {
    if (!editDrag) {
      return props.primitives;
    }

    return props.primitives.map((primitive) =>
      primitive.id === editDrag.primitiveId ? editDrag.preview : primitive
    );
  }, [editDrag, props.primitives]);

  const selectedPrimitive = useMemo(
    () => renderedPrimitives.find((primitive) => primitive.id === selectedId) ?? null,
    [renderedPrimitives, selectedId]
  );

  const snapPoints = useMemo(
    () => gatherSnapPoints(renderedPrimitives, props.tile),
    [renderedPrimitives, props.tile]
  );

  const snapTolerance = props.tile.size * 0.08;
  const linePassTolerance = props.tile.size * 0.05;
  const editHandleTolerance = props.tile.size * 0.09;

  const resolvePoint = (raw: Point): Point =>
    getSnapPoint(raw, { points: snapPoints, tolerance: snapTolerance }) ?? raw;

  const resolveLineEndWithPoints = (start: Point, raw: Point, points: Point[]): Point => {
    const endpointSnap = getSnapPoint(raw, { points, tolerance: snapTolerance });
    if (endpointSnap) {
      return endpointSnap;
    }

    return getLinePassThroughSnap(start, raw, points, linePassTolerance) ?? raw;
  };

  const resolveLineEnd = (start: Point, raw: Point): Point =>
    resolveLineEndWithPoints(start, raw, snapPoints);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const raw = toWorldPoint(event, viewBox);

    if (props.activeTool === 'erase') {
      const hit = hitTestPrimitive(raw, renderedPrimitives, props.tile.size * 0.1);
      if (hit) {
        props.onErasePrimitive(hit.id);
      }
      setSelectedId(null);
      return;
    }

    if (props.activeTool === 'pan') {
      setPanDrag({
        clientX: event.clientX,
        clientY: event.clientY,
        startOffset: panOffset
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (props.activeTool === 'select') {
      if (selectedPrimitive) {
        const handle = editHandleAtPoint(raw, selectedPrimitive, editHandleTolerance);
        if (handle) {
          setEditDrag({
            primitiveId: selectedPrimitive.id,
            handle,
            preview: selectedPrimitive
          });
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }

      const hit = hitTestPrimitive(raw, renderedPrimitives, props.tile.size * 0.1);
      if (hit) {
        setSelectedId(hit.id);
      } else {
        setSelectedId(null);
      }
      return;
    }

    setSelectedId(null);

    const point = resolvePoint(raw);
    if (props.activeTool === 'line') {
      setDraft({ kind: 'line', start: point, end: point });
    } else if (props.activeTool === 'circle') {
      setDraft({ kind: 'circle', center: point, radius: 0 });
    } else {
      return;
    }

    setDrawing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (panDrag) {
      const rect = event.currentTarget.getBoundingClientRect();
      const deltaX = event.clientX - panDrag.clientX;
      const deltaY = event.clientY - panDrag.clientY;
      const worldDeltaX = (deltaX / rect.width) * viewBox.width;
      const worldDeltaY = (deltaY / rect.height) * viewBox.height;

      setPanOffset({
        x: panDrag.startOffset.x - worldDeltaX,
        y: panDrag.startOffset.y - worldDeltaY
      });
      return;
    }

    if (editDrag) {
      const raw = toWorldPoint(event, viewBox);
      setEditDrag((current) => {
        if (!current) {
          return current;
        }

        if (
          current.preview.kind === 'line' &&
          (current.handle === 'line-a' || current.handle === 'line-b')
        ) {
          const anchor = current.handle === 'line-a' ? current.preview.b : current.preview.a;
          const snapPointsForLineEdit = gatherSnapPoints(
            props.primitives.filter((primitive) => primitive.id !== current.primitiveId),
            props.tile
          );
          const snappedPoint = resolveLineEndWithPoints(anchor, raw, snapPointsForLineEdit);
          return {
            ...current,
            preview: applyEditHandle(current.preview, current.handle, snappedPoint)
          };
        }

        const point = resolvePoint(raw);
        return {
          ...current,
          preview: applyEditHandle(current.preview, current.handle, point)
        };
      });
      return;
    }

    if (!drawing || !draft) {
      return;
    }

    const raw = toWorldPoint(event, viewBox);
    if (draft.kind === 'line') {
      setDraft({ ...draft, end: resolveLineEnd(draft.start, raw) });
      return;
    }

    const point = resolvePoint(raw);
    setDraft({
      ...draft,
      radius: distance(draft.center, point)
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (panDrag) {
      setPanDrag(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (editDrag) {
      props.onUpdatePrimitive(editDrag.preview);
      setEditDrag(null);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (drawing && draft) {
      if (draft.kind === 'line') {
        const lineLength = distance(draft.start, draft.end);
        if (lineLength > DRAW_MIN_DISTANCE) {
          props.onAddPrimitive({
            id: createId('line'),
            kind: 'line',
            a: draft.start,
            b: draft.end,
            color: props.activeColor
          });
        }
      } else if (draft.radius > DRAW_MIN_DISTANCE) {
        props.onAddPrimitive({
          id: createId('circle'),
          kind: 'circle',
          center: draft.center,
          radius: draft.radius,
          color: props.activeColor
        });
      }
    }

    setDrawing(false);
    setDraft(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const circleHandle =
    selectedPrimitive && selectedPrimitive.kind === 'circle'
      ? circleRadiusHandle(selectedPrimitive)
      : null;

  return (
    <section className="panel">
      <h2>Tile Editor</h2>
      <svg
        className="editor-canvas"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <clipPath id="tile-clip-editor">
            <path d={tilePath} />
          </clipPath>
        </defs>

        <g clipPath="url(#tile-clip-editor)">
          {periodicOffsets.flatMap((offset, idx) =>
            renderedPrimitives.map((primitive) => {
              const moved = translatePrimitive(primitive, offset);
              return (
                <PrimitiveSvg
                  key={`${primitive.id}-${idx}`}
                  primitive={moved}
                  strokeWidth={FIXED_STROKE_WIDTH}
                />
              );
            })
          )}
        </g>

        {snapPoints.map((point, idx) => (
          <circle
            key={`snap-${idx}`}
            className="snap-point"
            cx={point.x}
            cy={point.y}
            r={props.tile.size * 0.015}
          />
        ))}

        {props.activeTool === 'select' && selectedPrimitive ? (
          <PrimitiveSvg
            primitive={selectedPrimitive}
            strokeWidth={FIXED_STROKE_WIDTH * 2}
            className="selected-primitive"
          />
        ) : null}

        {props.activeTool === 'select' && selectedPrimitive && selectedPrimitive.kind === 'line' ? (
          <>
            <circle
              className="edit-handle"
              cx={selectedPrimitive.a.x}
              cy={selectedPrimitive.a.y}
              r={props.tile.size * 0.03}
            />
            <circle
              className="edit-handle"
              cx={selectedPrimitive.b.x}
              cy={selectedPrimitive.b.y}
              r={props.tile.size * 0.03}
            />
          </>
        ) : null}

        {props.activeTool === 'select' &&
        selectedPrimitive &&
        selectedPrimitive.kind === 'circle' &&
        circleHandle ? (
          <>
            <line
              className="edit-guide"
              x1={selectedPrimitive.center.x}
              y1={selectedPrimitive.center.y}
              x2={circleHandle.x}
              y2={circleHandle.y}
            />
            <circle
              className="edit-handle"
              cx={selectedPrimitive.center.x}
              cy={selectedPrimitive.center.y}
              r={props.tile.size * 0.03}
            />
            <circle
              className="edit-handle"
              cx={circleHandle.x}
              cy={circleHandle.y}
              r={props.tile.size * 0.03}
            />
          </>
        ) : null}

        {draft && draft.kind === 'line' ? (
          <line
            className="draft"
            x1={draft.start.x}
            y1={draft.start.y}
            x2={draft.end.x}
            y2={draft.end.y}
            stroke={props.activeColor}
            strokeWidth={FIXED_STROKE_WIDTH}
          />
        ) : null}

        {draft && draft.kind === 'circle' ? (
          <circle
            className="draft"
            cx={draft.center.x}
            cy={draft.center.y}
            r={draft.radius}
            stroke={props.activeColor}
            strokeWidth={FIXED_STROKE_WIDTH}
            fill="none"
          />
        ) : null}

        <path d={tilePath} className="tile-outline" />
      </svg>
      <p className="hint">
        Use Select to edit handles, Pan to move the editor view, and Line/Circle to draw new geometry.
      </p>
    </section>
  );
}
