import type { ArcPrimitive, CirclePrimitive, Point, Primitive, TileConfig } from '../types/model';
import { add, cross, distance, dot, EPSILON, pointKey, scale, subtract } from '../utils/math';
import { arcRadius, isClockwiseMinorArc, isPointOnArcSweep, normalizeArc, projectPointToCircle } from './arc';
import { getTilePolygon } from './tile';

type PathPrimitive = Extract<Primitive, { kind: 'line' | 'arc' }>;
type OffsetPrimitive = Extract<Primitive, { kind: 'line' | 'arc' | 'circle' }>;
type OffsetSide = 1 | -1;
const ENDPOINT_CLUSTER_TOLERANCE = 1;

interface GraphEdge {
  primitive: PathPrimitive;
  sourceIndex: number;
  start: Point;
  end: Point;
  startKey: string;
  endKey: string;
}

interface DirectedEdge {
  primitive: PathPrimitive;
  sourceIndex: number;
  start: Point;
  end: Point;
  startKey: string;
  endKey: string;
}

interface PathComponent {
  order: number;
  closed: boolean;
  segments: DirectedEdge[];
}

interface OffsetOptions {
  makeId?: (kind: OffsetPrimitive['kind']) => string;
  reuseIds?: string[];
  tile?: TileConfig;
}

interface EndpointCluster {
  key: string;
  point: Point;
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function getArcSweepClockwise(arc: Pick<ArcPrimitive, 'center' | 'start' | 'end' | 'largeArc'>): boolean {
  const clockwiseMinor = isClockwiseMinorArc(arc.center, arc.start, arc.end);
  return arc.largeArc ? !clockwiseMinor : clockwiseMinor;
}

function lineLineIntersectionInfinite(aStart: Point, aEnd: Point, bStart: Point, bEnd: Point): Point | null {
  const p = aStart;
  const r = subtract(aEnd, aStart);
  const q = bStart;
  const s = subtract(bEnd, bStart);
  const rxs = cross(r, s);

  if (Math.abs(rxs) < EPSILON) {
    return null;
  }

  const t = cross(subtract(q, p), s) / rxs;
  return add(p, scale(r, t));
}

function lineInfiniteSegmentIntersection(
  lineStart: Point,
  lineEnd: Point,
  segmentStart: Point,
  segmentEnd: Point
): Point | null {
  const p = lineStart;
  const r = subtract(lineEnd, lineStart);
  const q = segmentStart;
  const s = subtract(segmentEnd, segmentStart);
  const rxs = cross(r, s);

  if (Math.abs(rxs) < EPSILON) {
    return null;
  }

  const u = cross(subtract(q, p), r) / rxs;
  if (u < -EPSILON || u > 1 + EPSILON) {
    return null;
  }

  const t = cross(subtract(q, p), s) / rxs;
  return add(p, scale(r, t));
}

function lineCircleIntersectionsInfinite(
  lineStart: Point,
  lineEnd: Point,
  center: Point,
  radius: number
): Point[] {
  const d = subtract(lineEnd, lineStart);
  const f = subtract(lineStart, center);
  const a = dot(d, d);
  if (a <= EPSILON) {
    return [];
  }

  const b = 2 * dot(f, d);
  const c = dot(f, f) - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) {
    return [];
  }

  if (Math.abs(discriminant) < EPSILON) {
    return [add(lineStart, scale(d, -b / (2 * a)))];
  }

  const sqrt = Math.sqrt(Math.max(0, discriminant));
  return [
    add(lineStart, scale(d, (-b + sqrt) / (2 * a))),
    add(lineStart, scale(d, (-b - sqrt) / (2 * a)))
  ];
}

function circleCircleIntersectionsInfinite(
  aCenter: Point,
  aRadius: number,
  bCenter: Point,
  bRadius: number
): Point[] {
  const d = distance(aCenter, bCenter);
  if (d < EPSILON) {
    return [];
  }

  if (d > aRadius + bRadius + EPSILON) {
    return [];
  }

  if (d < Math.abs(aRadius - bRadius) - EPSILON) {
    return [];
  }

  const baseDistance = (aRadius * aRadius - bRadius * bRadius + d * d) / (2 * d);
  const heightSquared = aRadius * aRadius - baseDistance * baseDistance;
  if (heightSquared < -EPSILON) {
    return [];
  }

  const height = Math.sqrt(Math.max(0, heightSquared));
  const direction = {
    x: (bCenter.x - aCenter.x) / d,
    y: (bCenter.y - aCenter.y) / d
  };
  const base = {
    x: aCenter.x + baseDistance * direction.x,
    y: aCenter.y + baseDistance * direction.y
  };

  if (height < EPSILON) {
    return [base];
  }

  return [
    {
      x: base.x - direction.y * height,
      y: base.y + direction.x * height
    },
    {
      x: base.x + direction.y * height,
      y: base.y - direction.x * height
    }
  ];
}

function chooseClosest(points: Point[], target: Point): Point | null {
  if (points.length === 0) {
    return null;
  }

  let best = points[0];
  let bestDistance = distance(points[0], target);
  for (let index = 1; index < points.length; index += 1) {
    const candidate = points[index];
    const candidateDistance = distance(candidate, target);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }

  return best;
}

function pointOnSegment(point: Point, a: Point, b: Point, tolerance = EPSILON): boolean {
  const ab = subtract(b, a);
  const ap = subtract(point, a);
  const bp = subtract(point, b);
  return Math.abs(cross(ab, ap)) <= tolerance && dot(ap, bp) <= tolerance;
}

function primitiveStart(primitive: OffsetPrimitive): Point {
  if (primitive.kind === 'line') {
    return primitive.a;
  }
  if (primitive.kind === 'arc') {
    return primitive.start;
  }
  return {
    x: primitive.center.x + primitive.radius,
    y: primitive.center.y
  };
}

function primitiveEnd(primitive: OffsetPrimitive): Point {
  if (primitive.kind === 'line') {
    return primitive.b;
  }
  if (primitive.kind === 'arc') {
    return primitive.end;
  }
  return {
    x: primitive.center.x + primitive.radius,
    y: primitive.center.y
  };
}

function setPrimitiveStart(primitive: OffsetPrimitive, point: Point): OffsetPrimitive {
  if (primitive.kind === 'line') {
    return {
      ...primitive,
      a: point
    };
  }

  if (primitive.kind === 'arc') {
    return {
      ...primitive,
      start: point
    };
  }

  return primitive;
}

function setPrimitiveEnd(primitive: OffsetPrimitive, point: Point): OffsetPrimitive {
  if (primitive.kind === 'line') {
    return {
      ...primitive,
      b: point
    };
  }

  if (primitive.kind === 'arc') {
    return {
      ...primitive,
      end: point
    };
  }

  return primitive;
}

function computeJoinPoint(previous: OffsetPrimitive, next: OffsetPrimitive): Point {
  const fallback = midpoint(primitiveEnd(previous), primitiveStart(next));

  if (previous.kind === 'line' && next.kind === 'line') {
    return (
      lineLineIntersectionInfinite(previous.a, previous.b, next.a, next.b) ??
      primitiveEnd(previous)
    );
  }

  if (previous.kind === 'line' && next.kind === 'arc') {
    return (
      chooseClosest(
        lineCircleIntersectionsInfinite(previous.a, previous.b, next.center, arcRadius(next)),
        fallback
      ) ?? primitiveEnd(previous)
    );
  }

  if (previous.kind === 'arc' && next.kind === 'line') {
    return (
      chooseClosest(
        lineCircleIntersectionsInfinite(next.a, next.b, previous.center, arcRadius(previous)),
        fallback
      ) ?? primitiveEnd(previous)
    );
  }

  if (previous.kind === 'arc' && next.kind === 'arc') {
    return (
      chooseClosest(
        circleCircleIntersectionsInfinite(
          previous.center,
          arcRadius(previous),
          next.center,
          arcRadius(next)
        ),
        fallback
      ) ?? primitiveEnd(previous)
    );
  }

  return primitiveEnd(previous);
}

function pointOnTileBoundary(point: Point, tilePolygon: Point[]): boolean {
  for (let index = 0; index < tilePolygon.length; index += 1) {
    const a = tilePolygon[index];
    const b = tilePolygon[(index + 1) % tilePolygon.length];
    if (pointOnSegment(point, a, b, ENDPOINT_CLUSTER_TOLERANCE)) {
      return true;
    }
  }

  return false;
}

function isOffsettablePathPrimitive(primitive: Primitive): primitive is PathPrimitive {
  return primitive.kind === 'line' || primitive.kind === 'arc';
}

export function isOffsettablePrimitive(primitive: Primitive): boolean {
  return primitive.kind === 'line' || primitive.kind === 'arc' || primitive.kind === 'circle';
}

function normalizedPathPrimitive(primitive: PathPrimitive): PathPrimitive {
  return primitive.kind === 'arc' ? normalizeArc(primitive) : primitive;
}

function clusterEndpointKey(point: Point, clusters: EndpointCluster[]): string {
  const roundedKey = pointKey(point);
  const roundedMatch = clusters.find((cluster) => cluster.key === roundedKey);
  if (roundedMatch) {
    return roundedMatch.key;
  }

  const nearbyMatch = clusters.find(
    (cluster) => distance(cluster.point, point) <= ENDPOINT_CLUSTER_TOLERANCE
  );
  if (nearbyMatch) {
    return nearbyMatch.key;
  }

  clusters.push({
    key: roundedKey,
    point
  });
  return roundedKey;
}

function buildDirectedEdge(edge: GraphEdge, startKey: string): DirectedEdge {
  if (edge.startKey === startKey) {
    return {
      primitive: edge.primitive,
      sourceIndex: edge.sourceIndex,
      start: edge.start,
      end: edge.end,
      startKey: edge.startKey,
      endKey: edge.endKey
    };
  }

  return {
    primitive: edge.primitive,
    sourceIndex: edge.sourceIndex,
    start: edge.end,
    end: edge.start,
    startKey: edge.endKey,
    endKey: edge.startKey
  };
}

function walkPath(
  edges: GraphEdge[],
  adjacency: Map<string, number[]>,
  visited: Set<number>,
  startKey: string,
  firstEdgeId: number
): PathComponent {
  const segments: DirectedEdge[] = [];
  let currentKey = startKey;
  let edgeId: number | null = firstEdgeId;

  while (edgeId !== null && !visited.has(edgeId)) {
    visited.add(edgeId);
    const edge = edges[edgeId];
    const directed = buildDirectedEdge(edge, currentKey);
    segments.push(directed);
    currentKey = directed.endKey;

    const nextEdges = (adjacency.get(currentKey) ?? []).filter(
      (candidateId) => candidateId !== edgeId && !visited.has(candidateId)
    );
    if ((adjacency.get(currentKey)?.length ?? 0) !== 2 || nextEdges.length === 0) {
      break;
    }

    edgeId = nextEdges[0];
  }

  return {
    order: Math.min(...segments.map((segment) => segment.sourceIndex)),
    closed: false,
    segments
  };
}

function walkCycle(
  edges: GraphEdge[],
  adjacency: Map<string, number[]>,
  visited: Set<number>,
  firstEdgeId: number
): PathComponent {
  const segments: DirectedEdge[] = [];
  const firstEdge = edges[firstEdgeId];
  const startKey = firstEdge.startKey;
  let currentKey = startKey;
  let edgeId: number | null = firstEdgeId;
  let closed = false;

  while (edgeId !== null && !visited.has(edgeId)) {
    visited.add(edgeId);
    const edge = edges[edgeId];
    const directed = buildDirectedEdge(edge, currentKey);
    segments.push(directed);
    currentKey = directed.endKey;

    const nextEdges = (adjacency.get(currentKey) ?? []).filter(
      (candidateId) => candidateId !== edgeId && !visited.has(candidateId)
    );
    if (nextEdges.length === 0) {
      closed = currentKey === startKey;
      break;
    }

    edgeId = nextEdges[0];
  }

  return {
    order: Math.min(...segments.map((segment) => segment.sourceIndex)),
    closed,
    segments
  };
}

function decomposePathComponents(primitives: Primitive[]): PathComponent[] {
  const edges: GraphEdge[] = [];
  const adjacency = new Map<string, number[]>();
  const endpointClusters: EndpointCluster[] = [];

  primitives.forEach((primitive, sourceIndex) => {
    if (!isOffsettablePathPrimitive(primitive)) {
      return;
    }

    const normalized = normalizedPathPrimitive(primitive);
    const start = normalized.kind === 'line' ? normalized.a : normalized.start;
    const end = normalized.kind === 'line' ? normalized.b : normalized.end;
    const startKey = clusterEndpointKey(start, endpointClusters);
    const endKey = clusterEndpointKey(end, endpointClusters);
    const edgeId = edges.length;
    edges.push({
      primitive: normalized,
      sourceIndex,
      start,
      end,
      startKey,
      endKey
    });
    adjacency.set(startKey, [...(adjacency.get(startKey) ?? []), edgeId]);
    adjacency.set(endKey, [...(adjacency.get(endKey) ?? []), edgeId]);
  });

  const visited = new Set<number>();
  const paths: PathComponent[] = [];
  const terminalKeys = [...adjacency.entries()]
    .filter(([, edgeIds]) => edgeIds.length !== 2)
    .map(([key]) => key);

  for (const terminalKey of terminalKeys) {
    for (const edgeId of adjacency.get(terminalKey) ?? []) {
      if (visited.has(edgeId)) {
        continue;
      }
      paths.push(walkPath(edges, adjacency, visited, terminalKey, edgeId));
    }
  }

  for (let edgeId = 0; edgeId < edges.length; edgeId += 1) {
    if (visited.has(edgeId)) {
      continue;
    }
    paths.push(walkCycle(edges, adjacency, visited, edgeId));
  }

  return paths.sort((a, b) => a.order - b.order);
}

function buildOffsetPathPrimitive(
  segment: DirectedEdge,
  side: OffsetSide,
  distanceValue: number,
  id: string
): OffsetPrimitive | null {
  if (segment.primitive.kind === 'line') {
    const direction = subtract(segment.end, segment.start);
    const length = Math.hypot(direction.x, direction.y);
    if (length < EPSILON) {
      return null;
    }

    const offset = {
      x: (-direction.y / length) * distanceValue * side,
      y: (direction.x / length) * distanceValue * side
    };

    return {
      id,
      kind: 'line',
      a: add(segment.start, offset),
      b: add(segment.end, offset),
      color: segment.primitive.color,
      strokeWidth: segment.primitive.strokeWidth
    };
  }

  const radius = arcRadius(segment.primitive);
  const clockwise = getArcSweepClockwise({
    center: segment.primitive.center,
    start: segment.start,
    end: segment.end,
    largeArc: segment.primitive.largeArc
  });
  const radialOffset = distanceValue * side * (clockwise ? 1 : -1);
  const nextRadius = radius + radialOffset;
  if (nextRadius <= EPSILON) {
    return null;
  }

  const start = projectPointToCircle(segment.primitive.center, nextRadius, segment.start);
  const end = projectPointToCircle(segment.primitive.center, nextRadius, segment.end);

  return {
    id,
    kind: 'arc',
    center: segment.primitive.center,
    start,
    end,
    clockwise: isClockwiseMinorArc(segment.primitive.center, start, end),
    largeArc: segment.primitive.largeArc,
    color: segment.primitive.color,
    strokeWidth: segment.primitive.strokeWidth
  };
}

function joinOffsetPath(primitives: OffsetPrimitive[], closed: boolean): OffsetPrimitive[] {
  if (primitives.length <= 1) {
    return primitives;
  }

  const joined = [...primitives];
  const joinCount = closed ? primitives.length : primitives.length - 1;

  for (let index = 0; index < joinCount; index += 1) {
    const previousIndex = index;
    const nextIndex = (index + 1) % primitives.length;
    const join = computeJoinPoint(joined[previousIndex], joined[nextIndex]);
    joined[previousIndex] = setPrimitiveEnd(joined[previousIndex], join);
    joined[nextIndex] = setPrimitiveStart(joined[nextIndex], join);
  }

  return joined;
}

function boundaryIntersectionsForPrimitive(primitive: OffsetPrimitive, tilePolygon: Point[]): Point[] {
  const intersections: Point[] = [];

  for (let index = 0; index < tilePolygon.length; index += 1) {
    const a = tilePolygon[index];
    const b = tilePolygon[(index + 1) % tilePolygon.length];

    if (primitive.kind === 'line') {
      const intersection = lineInfiniteSegmentIntersection(primitive.a, primitive.b, a, b);
      if (intersection) {
        intersections.push(intersection);
      }
      continue;
    }

    if (primitive.kind === 'arc') {
      const candidates = lineCircleIntersectionsInfinite(a, b, primitive.center, arcRadius(primitive)).filter(
        (candidate) =>
          pointOnSegment(candidate, a, b, ENDPOINT_CLUSTER_TOLERANCE) &&
          isPointOnArcSweep(candidate, primitive, ENDPOINT_CLUSTER_TOLERANCE)
      );

      for (const candidate of candidates) {
        intersections.push(candidate);
      }
    }
  }

  const dedup = new Map<string, Point>();
  for (const point of intersections) {
    dedup.set(pointKey(point), point);
  }

  return [...dedup.values()];
}

function trimOpenPathToTileBoundary(
  primitives: OffsetPrimitive[],
  path: PathComponent,
  tile: TileConfig | undefined
): OffsetPrimitive[] {
  if (!tile || path.closed || primitives.length === 0) {
    return primitives;
  }

  const tilePolygon = getTilePolygon(tile);
  const trimmed = [...primitives];
  const firstSegment = path.segments[0];
  const lastSegment = path.segments[path.segments.length - 1];

  if (pointOnTileBoundary(firstSegment.start, tilePolygon)) {
    const candidates = boundaryIntersectionsForPrimitive(trimmed[0], tilePolygon);
    const boundaryPoint = chooseClosest(candidates, primitiveStart(trimmed[0]));
    if (boundaryPoint) {
      trimmed[0] = setPrimitiveStart(trimmed[0], boundaryPoint);
    }
  }

  if (pointOnTileBoundary(lastSegment.end, tilePolygon)) {
    const lastIndex = trimmed.length - 1;
    const candidates = boundaryIntersectionsForPrimitive(trimmed[lastIndex], tilePolygon);
    const boundaryPoint = chooseClosest(candidates, primitiveEnd(trimmed[lastIndex]));
    if (boundaryPoint) {
      trimmed[lastIndex] = setPrimitiveEnd(trimmed[lastIndex], boundaryPoint);
    }
  }

  return trimmed;
}

function createIdAssigner(options: OffsetOptions): (kind: OffsetPrimitive['kind']) => string {
  let reuseIndex = 0;
  const generatedCounts = new Map<OffsetPrimitive['kind'], number>();

  return (kind) => {
    if (options.reuseIds && reuseIndex < options.reuseIds.length) {
      const id = options.reuseIds[reuseIndex];
      reuseIndex += 1;
      return id;
    }

    if (options.makeId) {
      return options.makeId(kind);
    }

    const nextCount = (generatedCounts.get(kind) ?? 0) + 1;
    generatedCounts.set(kind, nextCount);
    return `offset-${kind}-${nextCount}`;
  };
}

function buildOffsetCircle(
  circle: CirclePrimitive,
  radius: number,
  id: string
): CirclePrimitive | null {
  if (radius <= EPSILON) {
    return null;
  }

  return {
    id,
    kind: 'circle',
    center: circle.center,
    radius,
    color: circle.color,
    strokeWidth: circle.strokeWidth
  };
}

export function buildSymmetricOffsets(
  primitives: Primitive[],
  distanceValue: number,
  options: OffsetOptions = {}
): OffsetPrimitive[] {
  const offsetDistance = Math.abs(distanceValue);
  if (offsetDistance <= EPSILON) {
    return [];
  }

  const assignId = createIdAssigner(options);
  const components: Array<
    | { order: number; kind: 'circle'; primitive: CirclePrimitive }
    | { order: number; kind: 'path'; path: PathComponent }
  > = [];

  primitives.forEach((primitive, index) => {
    if (primitive.kind === 'circle') {
      components.push({
        order: index,
        kind: 'circle',
        primitive
      });
    }
  });

  for (const path of decomposePathComponents(primitives)) {
    if (path.segments.length > 0) {
      components.push({
        order: path.order,
        kind: 'path',
        path
      });
    }
  }

  components.sort((a, b) => a.order - b.order);

  const output: OffsetPrimitive[] = [];
  for (const component of components) {
    if (component.kind === 'circle') {
      const outer = buildOffsetCircle(
        component.primitive,
        component.primitive.radius + offsetDistance,
        assignId('circle')
      );
      if (outer) {
        output.push(outer);
      }

      const inner = buildOffsetCircle(
        component.primitive,
        component.primitive.radius - offsetDistance,
        assignId('circle')
      );
      if (inner) {
        output.push(inner);
      }
      continue;
    }

    for (const side of [1, -1] as const) {
      const sidePrimitives: OffsetPrimitive[] = [];
      let valid = true;

      for (const segment of component.path.segments) {
        const next = buildOffsetPathPrimitive(segment, side, offsetDistance, assignId(segment.primitive.kind));
        if (!next) {
          valid = false;
          break;
        }
        sidePrimitives.push(next);
      }

      if (!valid) {
        continue;
      }

      output.push(
        ...trimOpenPathToTileBoundary(
          joinOffsetPath(sidePrimitives, component.path.closed),
          component.path,
          options.tile
        )
      );
    }
  }

  return output;
}
