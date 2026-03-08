import type { ArcPrimitive, CirclePrimitive, Point, Primitive, TileConfig } from '../types/model';
import { add, cross, distance, dot, EPSILON, pointKey, scale, subtract } from '../utils/math';
import { arcRadius, isClockwiseMinorArc, isPointOnArcSweep, normalizeArc, projectPointToCircle } from './arc';
import { getTilePolygon, periodicNeighborOffsets } from './tile';
import { translatePrimitive } from './transforms';

type PathPrimitive = Extract<Primitive, { kind: 'line' | 'arc' }>;
type OffsetPrimitive = Extract<Primitive, { kind: 'line' | 'arc' | 'circle' }>;
type OffsetSide = 1 | -1;
const ENDPOINT_CLUSTER_TOLERANCE = 1;

interface GraphEdge {
  id: number;
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
  sourceStart: Point;
  sourceEnd: Point;
  startKey: string;
  endKey: string;
  startDegree: number;
  endDegree: number;
}

interface PathComponent {
  order: number;
  closed: boolean;
  segments: DirectedEdge[];
  startDegree: number;
  endDegree: number;
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

interface PrimitiveEndpointRef {
  primitiveIndex: number;
  endpoint: 'start' | 'end';
}

interface JunctionIncidence {
  sourceIndex: number;
  point: Point;
  other: Point;
  ccw: PrimitiveEndpointRef | null;
  cw: PrimitiveEndpointRef | null;
}

interface PathFragment {
  primitive: PathPrimitive;
  sourceIndex: number;
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function translationOffsets(tile: TileConfig | undefined): Point[] {
  const offsets = [{ x: 0, y: 0 }];
  if (!tile) {
    return offsets;
  }

  for (const offset of periodicNeighborOffsets(tile)) {
    if (Math.abs(offset.x) < EPSILON && Math.abs(offset.y) < EPSILON) {
      continue;
    }
    offsets.push(offset);
  }

  return offsets;
}

function alignPointToTarget(point: Point, target: Point, tile: TileConfig | undefined): { point: Point; offset: Point } {
  const offsets = translationOffsets(tile);
  let bestOffset = offsets[0];
  let bestPoint = add(point, bestOffset);
  let bestDistance = distance(bestPoint, target);

  for (let index = 1; index < offsets.length; index += 1) {
    const offset = offsets[index];
    const candidate = add(point, offset);
    const candidateDistance = distance(candidate, target);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestOffset = offset;
      bestPoint = candidate;
    }
  }

  return {
    point: bestPoint,
    offset: bestOffset
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

function lineLineIntersectionSegmentDetailed(
  aStart: Point,
  aEnd: Point,
  bStart: Point,
  bEnd: Point
): { point: Point; tA: number; tB: number } | null {
  const p = aStart;
  const r = subtract(aEnd, aStart);
  const q = bStart;
  const s = subtract(bEnd, bStart);
  const rxs = cross(r, s);
  if (Math.abs(rxs) < EPSILON) {
    return null;
  }

  const qmp = subtract(q, p);
  const tA = cross(qmp, s) / rxs;
  const tB = cross(qmp, r) / rxs;
  if (tA < -EPSILON || tA > 1 + EPSILON || tB < -EPSILON || tB > 1 + EPSILON) {
    return null;
  }

  return {
    point: add(p, scale(r, tA)),
    tA,
    tB
  };
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

function buildPathFragments(primitives: Primitive[]): PathFragment[] {
  const pathPrimitives = primitives.map((primitive, sourceIndex) =>
    isOffsettablePathPrimitive(primitive)
      ? {
          primitive: normalizedPathPrimitive(primitive),
          sourceIndex
        }
      : null
  );
  const lineSplits = new Map<number, Array<{ point: Point; t: number }>>();

  for (let i = 0; i < pathPrimitives.length; i += 1) {
    const current = pathPrimitives[i];
    if (!current || current.primitive.kind !== 'line') {
      continue;
    }

    for (let j = i + 1; j < pathPrimitives.length; j += 1) {
      const candidate = pathPrimitives[j];
      if (!candidate || candidate.primitive.kind !== 'line') {
        continue;
      }

      const hit = lineLineIntersectionSegmentDetailed(
        current.primitive.a,
        current.primitive.b,
        candidate.primitive.a,
        candidate.primitive.b
      );
      if (!hit) {
        continue;
      }

      if (
        hit.tA > EPSILON &&
        hit.tA < 1 - EPSILON &&
        distance(hit.point, current.primitive.a) > ENDPOINT_CLUSTER_TOLERANCE &&
        distance(hit.point, current.primitive.b) > ENDPOINT_CLUSTER_TOLERANCE
      ) {
        lineSplits.set(current.sourceIndex, [
          ...(lineSplits.get(current.sourceIndex) ?? []),
          { point: hit.point, t: hit.tA }
        ]);
      }

      if (
        hit.tB > EPSILON &&
        hit.tB < 1 - EPSILON &&
        distance(hit.point, candidate.primitive.a) > ENDPOINT_CLUSTER_TOLERANCE &&
        distance(hit.point, candidate.primitive.b) > ENDPOINT_CLUSTER_TOLERANCE
      ) {
        lineSplits.set(candidate.sourceIndex, [
          ...(lineSplits.get(candidate.sourceIndex) ?? []),
          { point: hit.point, t: hit.tB }
        ]);
      }
    }
  }

  const fragments: PathFragment[] = [];

  for (const entry of pathPrimitives) {
    if (!entry) {
      continue;
    }

    if (entry.primitive.kind !== 'line') {
      fragments.push(entry);
      continue;
    }

    const splitPoints = [
      { point: entry.primitive.a, t: 0 },
      ...(lineSplits.get(entry.sourceIndex) ?? []),
      { point: entry.primitive.b, t: 1 }
    ]
      .sort((a, b) => a.t - b.t)
      .filter(
        (candidate, index, all) =>
          index === 0 || distance(candidate.point, all[index - 1].point) > EPSILON
      );

    for (let index = 0; index < splitPoints.length - 1; index += 1) {
      const start = splitPoints[index].point;
      const end = splitPoints[index + 1].point;
      if (distance(start, end) <= EPSILON) {
        continue;
      }

      fragments.push({
        sourceIndex: entry.sourceIndex,
        primitive: {
          id: entry.primitive.id,
          kind: 'line',
          a: start,
          b: end,
          color: entry.primitive.color,
          strokeWidth: entry.primitive.strokeWidth
        }
      });
    }
  }

  return fragments;
}

function clusterEndpointKey(point: Point, clusters: EndpointCluster[]): string {
  const roundedKey = pointKey(point);
  const roundedMatch = clusters.find((cluster) => cluster.key === roundedKey);
  if (roundedMatch) {
    return roundedMatch.key;
  }

  const nearbyMatch = clusters.find((cluster) => distance(cluster.point, point) <= ENDPOINT_CLUSTER_TOLERANCE);
  if (nearbyMatch) {
    return nearbyMatch.key;
  }

  clusters.push({
    key: roundedKey,
    point
  });
  return roundedKey;
}

function buildDirectedEdge(
  edge: GraphEdge,
  startKey: string,
  startWorldPoint: Point,
  adjacency: Map<string, number[]>,
  tile: TileConfig | undefined
): DirectedEdge {
  const sourceStart = edge.startKey === startKey ? edge.start : edge.end;
  const sourceEnd = edge.startKey === startKey ? edge.end : edge.start;
  const alignment = alignPointToTarget(sourceStart, startWorldPoint, tile);
  const endKey = edge.startKey === startKey ? edge.endKey : edge.startKey;

  return {
    primitive: edge.primitive,
    sourceIndex: edge.sourceIndex,
    start: alignment.point,
    end: add(sourceEnd, alignment.offset),
    sourceStart,
    sourceEnd,
    startKey,
    endKey,
    startDegree: adjacency.get(startKey)?.length ?? 0,
    endDegree: adjacency.get(endKey)?.length ?? 0
  };
}

function directionVector(edge: DirectedEdge): Point {
  const delta = subtract(edge.end, edge.start);
  const magnitude = Math.hypot(delta.x, delta.y);
  if (magnitude <= EPSILON) {
    return { x: 0, y: 0 };
  }

  return {
    x: delta.x / magnitude,
    y: delta.y / magnitude
  };
}

function chooseNextEdge(
  edges: GraphEdge[],
  adjacency: Map<string, number[]>,
  visited: Set<number>,
  currentEdgeId: number,
  currentEdge: DirectedEdge,
  tile: TileConfig | undefined
): { edgeId: number; directed: DirectedEdge } | null {
  const candidates = (adjacency.get(currentEdge.endKey) ?? []).filter(
    (candidateId) => candidateId !== currentEdgeId && !visited.has(candidateId)
  );
  if (candidates.length === 0) {
    return null;
  }

  const incoming = directionVector(currentEdge);
  let best: { edgeId: number; directed: DirectedEdge } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidateId of candidates) {
    const directed = buildDirectedEdge(edges[candidateId], currentEdge.endKey, currentEdge.end, adjacency, tile);
    const score = dot(incoming, directionVector(directed));
    if (score > bestScore) {
      bestScore = score;
      best = {
        edgeId: candidateId,
        directed
      };
    }
  }

  return best;
}

function walkPath(
  edges: GraphEdge[],
  clusters: Map<string, EndpointCluster>,
  adjacency: Map<string, number[]>,
  visited: Set<number>,
  startKey: string,
  firstEdgeId: number,
  tile: TileConfig | undefined
): PathComponent {
  const startWorldPoint = clusters.get(startKey)?.point ?? edges[firstEdgeId].start;
  const segments: DirectedEdge[] = [];
  let edgeId: number | null = firstEdgeId;
  let current = buildDirectedEdge(edges[firstEdgeId], startKey, startWorldPoint, adjacency, tile);

  while (edgeId !== null && !visited.has(edgeId)) {
    visited.add(edgeId);
    segments.push(current);

    if (current.endDegree !== 2) {
      break;
    }

    const next = chooseNextEdge(edges, adjacency, visited, edgeId, current, tile);
    if (!next) {
      break;
    }

    edgeId = next.edgeId;
    current = next.directed;
  }

  return {
    order: Math.min(...segments.map((segment) => segment.sourceIndex)),
    closed: false,
    segments,
    startDegree: segments[0]?.startDegree ?? 0,
    endDegree: segments[segments.length - 1]?.endDegree ?? 0
  };
}

function walkCycle(
  edges: GraphEdge[],
  clusters: Map<string, EndpointCluster>,
  adjacency: Map<string, number[]>,
  visited: Set<number>,
  firstEdgeId: number,
  tile: TileConfig | undefined
): PathComponent {
  const firstEdge = edges[firstEdgeId];
  const startKey = firstEdge.startKey;
  const startWorldPoint = clusters.get(startKey)?.point ?? firstEdge.start;
  const segments: DirectedEdge[] = [];
  let edgeId: number | null = firstEdgeId;
  let current = buildDirectedEdge(firstEdge, startKey, startWorldPoint, adjacency, tile);
  let closed = false;

  while (edgeId !== null && !visited.has(edgeId)) {
    visited.add(edgeId);
    segments.push(current);

    const next = chooseNextEdge(edges, adjacency, visited, edgeId, current, tile);
    if (!next) {
      closed =
        current.endKey === startKey &&
        distance(current.end, startWorldPoint) <= ENDPOINT_CLUSTER_TOLERANCE;
      break;
    }

    edgeId = next.edgeId;
    current = next.directed;
  }

  return {
    order: Math.min(...segments.map((segment) => segment.sourceIndex)),
    closed,
    segments,
    startDegree: segments[0]?.startDegree ?? 0,
    endDegree: segments[segments.length - 1]?.endDegree ?? 0
  };
}

function decomposePathComponents(primitives: Primitive[], tile: TileConfig | undefined): PathComponent[] {
  const edges: GraphEdge[] = [];
  const adjacency = new Map<string, number[]>();
  const endpointClusters: EndpointCluster[] = [];

  for (const fragment of buildPathFragments(primitives)) {
    const start = fragment.primitive.kind === 'line' ? fragment.primitive.a : fragment.primitive.start;
    const end = fragment.primitive.kind === 'line' ? fragment.primitive.b : fragment.primitive.end;
    const startKey = clusterEndpointKey(start, endpointClusters);
    const endKey = clusterEndpointKey(end, endpointClusters);
    const edgeId = edges.length;
    edges.push({
      id: edgeId,
      primitive: fragment.primitive,
      sourceIndex: fragment.sourceIndex,
      start,
      end,
      startKey,
      endKey
    });
    adjacency.set(startKey, [...(adjacency.get(startKey) ?? []), edgeId]);
    adjacency.set(endKey, [...(adjacency.get(endKey) ?? []), edgeId]);
  }

  const clusters = new Map(endpointClusters.map((cluster) => [cluster.key, cluster]));
  const visited = new Set<number>();
  const paths: PathComponent[] = [];
  const breakKeys = [...adjacency.entries()]
    .filter(([, edgeIds]) => edgeIds.length !== 2)
    .map(([key]) => key);

  for (const breakKey of breakKeys) {
    for (const edgeId of adjacency.get(breakKey) ?? []) {
      if (visited.has(edgeId)) {
        continue;
      }
      paths.push(walkPath(edges, clusters, adjacency, visited, breakKey, edgeId, tile));
    }
  }

  for (let edgeId = 0; edgeId < edges.length; edgeId += 1) {
    if (visited.has(edgeId)) {
      continue;
    }
    paths.push(walkCycle(edges, clusters, adjacency, visited, edgeId, tile));
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

function setPrimitiveEndpoint(
  primitive: OffsetPrimitive,
  endpoint: 'start' | 'end',
  point: Point
): OffsetPrimitive {
  return endpoint === 'start' ? setPrimitiveStart(primitive, point) : setPrimitiveEnd(primitive, point);
}

function reverseOffsetPrimitive(primitive: OffsetPrimitive): OffsetPrimitive {
  if (primitive.kind === 'line') {
    return {
      ...primitive,
      a: primitive.b,
      b: primitive.a
    };
  }

  if (primitive.kind === 'arc') {
    return {
      ...primitive,
      start: primitive.end,
      end: primitive.start,
      clockwise: !primitive.clockwise
    };
  }

  return primitive;
}

function orientPrimitiveForJoin(
  primitive: OffsetPrimitive,
  endpoint: 'start' | 'end',
  role: 'previous' | 'next'
): OffsetPrimitive {
  const shouldReverse = role === 'previous' ? endpoint === 'start' : endpoint === 'end';
  return shouldReverse ? reverseOffsetPrimitive(primitive) : primitive;
}

function applyOrderedJunctionGroup(
  basePrimitives: OffsetPrimitive[],
  adjustedPrimitives: OffsetPrimitive[],
  ordered: Array<{
    incidence: JunctionIncidence;
    offset: Point;
  }>
): void {
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const next = ordered[(index + 1) % ordered.length];
    if (!current.incidence.ccw || !next.incidence.cw) {
      continue;
    }

    const currentPrimitive = basePrimitives[current.incidence.ccw.primitiveIndex];
    const nextPrimitive = basePrimitives[next.incidence.cw.primitiveIndex];
    if (!currentPrimitive || !nextPrimitive) {
      continue;
    }

    const currentWorld = translatePrimitive(currentPrimitive, current.offset) as OffsetPrimitive;
    const nextWorld = translatePrimitive(nextPrimitive, next.offset) as OffsetPrimitive;
    const join = computeJoinPoint(
      orientPrimitiveForJoin(currentWorld, current.incidence.ccw.endpoint, 'previous'),
      orientPrimitiveForJoin(nextWorld, next.incidence.cw.endpoint, 'next')
    );

    adjustedPrimitives[current.incidence.ccw.primitiveIndex] = setPrimitiveEndpoint(
      adjustedPrimitives[current.incidence.ccw.primitiveIndex],
      current.incidence.ccw.endpoint,
      subtract(join, current.offset)
    );
    adjustedPrimitives[next.incidence.cw.primitiveIndex] = setPrimitiveEndpoint(
      adjustedPrimitives[next.incidence.cw.primitiveIndex],
      next.incidence.cw.endpoint,
      subtract(join, next.offset)
    );
  }
}

function applyInteriorJunctionJoins(
  primitives: OffsetPrimitive[],
  incidences: JunctionIncidence[]
): OffsetPrimitive[] {
  if (incidences.length === 0) {
    return primitives;
  }

  const groups: Array<{ anchor: Point; members: JunctionIncidence[] }> = [];
  for (const incidence of incidences) {
    let targetGroup: { anchor: Point; members: JunctionIncidence[] } | null = null;

    for (const group of groups) {
      if (distance(incidence.point, group.anchor) <= ENDPOINT_CLUSTER_TOLERANCE) {
        targetGroup = group;
        break;
      }
    }

    if (!targetGroup) {
      targetGroup = {
        anchor: incidence.point,
        members: []
      };
      groups.push(targetGroup);
    }

    targetGroup.members.push(incidence);
  }

  const adjusted = [...primitives];

  for (const group of groups) {
    if (group.members.length <= 2) {
      continue;
    }

    const ordered = group.members
      .map((incidence) => ({
        incidence,
        offset: { x: 0, y: 0 },
        angle: Math.atan2(incidence.other.y - incidence.point.y, incidence.other.x - incidence.point.x)
      }))
      .sort((a, b) => a.angle - b.angle)
      .map(({ angle: _angle, ...rest }) => rest);

    applyOrderedJunctionGroup(primitives, adjusted, ordered);
  }

  return adjusted;
}

function applyWrappedBoundaryJoins(
  primitives: OffsetPrimitive[],
  incidences: JunctionIncidence[],
  tile: TileConfig | undefined
): OffsetPrimitive[] {
  if (!tile || incidences.length === 0) {
    return primitives;
  }

  const groups: Array<{ anchor: Point; members: JunctionIncidence[] }> = [];
  for (const incidence of incidences) {
    let targetGroup: { anchor: Point; members: JunctionIncidence[] } | null = null;

    for (const group of groups) {
      const aligned = alignPointToTarget(incidence.point, group.anchor, tile);
      if (distance(aligned.point, group.anchor) <= ENDPOINT_CLUSTER_TOLERANCE) {
        targetGroup = group;
        break;
      }
    }

    if (!targetGroup) {
      targetGroup = {
        anchor: incidence.point,
        members: []
      };
      groups.push(targetGroup);
    }

    targetGroup.members.push(incidence);
  }

  const adjusted = [...primitives];

  for (const group of groups) {
    if (group.members.length <= 2) {
      continue;
    }

    const ordered = group.members
      .map((incidence) => {
        const alignment = alignPointToTarget(incidence.point, group.anchor, tile);
        const alignedOther = add(incidence.other, alignment.offset);
        const direction = subtract(alignedOther, alignment.point);
        return {
          incidence,
          offset: alignment.offset,
          angle: Math.atan2(direction.y, direction.x)
        };
      })
      .sort((a, b) => a.angle - b.angle)
      .map(({ angle: _angle, ...rest }) => rest);

    applyOrderedJunctionGroup(primitives, adjusted, ordered);
  }

  return adjusted;
}

function boundaryIntersectionsForPrimitive(
  primitive: OffsetPrimitive,
  tilePolygon: Point[],
  tile: TileConfig | undefined
): Point[] {
  const intersections: Point[] = [];
  const boundaryOffsets = translationOffsets(tile);

  for (const boundaryOffset of boundaryOffsets) {
    for (let index = 0; index < tilePolygon.length; index += 1) {
      const a = add(tilePolygon[index], boundaryOffset);
      const b = add(tilePolygon[(index + 1) % tilePolygon.length], boundaryOffset);

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
  }

  const dedup = new Map<string, Point>();
  for (const point of intersections) {
    dedup.set(pointKey(point), point);
  }

  return [...dedup.values()];
}

function trimOpenPathToTileBoundary(
  primitives: OffsetPrimitive[],
  primitiveIndices: number[],
  path: PathComponent,
  tile: TileConfig | undefined
): OffsetPrimitive[] {
  if (!tile || path.closed || primitives.length === 0 || primitiveIndices.length === 0) {
    return primitives;
  }

  const tilePolygon = getTilePolygon(tile);
  const trimmed = [...primitives];
  const firstSegment = path.segments[0];
  const lastSegment = path.segments[path.segments.length - 1];

  if (pointOnTileBoundary(firstSegment.sourceStart, tilePolygon)) {
    const firstPrimitiveIndex = primitiveIndices[0];
    const candidates = boundaryIntersectionsForPrimitive(trimmed[firstPrimitiveIndex], tilePolygon, tile);
    const boundaryPoint = chooseClosest(candidates, primitiveStart(trimmed[firstPrimitiveIndex]));
    if (boundaryPoint) {
      trimmed[firstPrimitiveIndex] = setPrimitiveStart(trimmed[firstPrimitiveIndex], boundaryPoint);
    }
  }

  if (pointOnTileBoundary(lastSegment.sourceEnd, tilePolygon)) {
    const lastPrimitiveIndex = primitiveIndices[primitiveIndices.length - 1];
    const candidates = boundaryIntersectionsForPrimitive(trimmed[lastPrimitiveIndex], tilePolygon, tile);
    const boundaryPoint = chooseClosest(candidates, primitiveEnd(trimmed[lastPrimitiveIndex]));
    if (boundaryPoint) {
      trimmed[lastPrimitiveIndex] = setPrimitiveEnd(trimmed[lastPrimitiveIndex], boundaryPoint);
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
  const tilePolygon = options.tile ? getTilePolygon(options.tile) : null;
  const wrappedBoundaryIncidences: JunctionIncidence[] = [];
  const interiorJunctionIncidences: JunctionIncidence[] = [];
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

  for (const path of decomposePathComponents(primitives, options.tile)) {
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

    const sideIndices = new Map<OffsetSide, number[]>();
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

      const startIndex = output.length;
      output.push(...joinOffsetPath(sidePrimitives, component.path.closed));
      const primitiveIndices = Array.from({ length: sidePrimitives.length }, (_, index) => startIndex + index);
      sideIndices.set(side, primitiveIndices);
      const trimmed = trimOpenPathToTileBoundary(
        output,
        primitiveIndices,
        component.path,
        options.tile
      );
      output.splice(0, output.length, ...trimmed);
    }

    if (component.path.segments.length === 0) {
      continue;
    }

    const firstSegment = component.path.segments[0];
    const lastSegment = component.path.segments[component.path.segments.length - 1];
    const leftIndices = sideIndices.get(1) ?? [];
    const rightIndices = sideIndices.get(-1) ?? [];
    if (
      component.path.startDegree > 2 &&
      (!tilePolygon || !pointOnTileBoundary(firstSegment.sourceStart, tilePolygon))
    ) {
      interiorJunctionIncidences.push({
        sourceIndex: firstSegment.sourceIndex,
        point: firstSegment.sourceStart,
        other: firstSegment.sourceEnd,
        ccw: leftIndices[0] === undefined ? null : { primitiveIndex: leftIndices[0], endpoint: 'start' },
        cw: rightIndices[0] === undefined ? null : { primitiveIndex: rightIndices[0], endpoint: 'start' }
      });
    }

    if (
      component.path.endDegree > 2 &&
      (!tilePolygon || !pointOnTileBoundary(lastSegment.sourceEnd, tilePolygon))
    ) {
      const leftIndex = leftIndices[leftIndices.length - 1];
      const rightIndex = rightIndices[rightIndices.length - 1];
      interiorJunctionIncidences.push({
        sourceIndex: lastSegment.sourceIndex,
        point: lastSegment.sourceEnd,
        other: lastSegment.sourceStart,
        ccw: rightIndex === undefined ? null : { primitiveIndex: rightIndex, endpoint: 'end' },
        cw: leftIndex === undefined ? null : { primitiveIndex: leftIndex, endpoint: 'end' }
      });
    }

    if (tilePolygon) {
      component.path.segments.forEach((segment, segmentIndex) => {
        const leftIndex = leftIndices[segmentIndex];
        const rightIndex = rightIndices[segmentIndex];

        if (pointOnTileBoundary(segment.sourceStart, tilePolygon)) {
          wrappedBoundaryIncidences.push({
            sourceIndex: segment.sourceIndex,
            point: segment.sourceStart,
            other: segment.sourceEnd,
            ccw: leftIndex === undefined ? null : { primitiveIndex: leftIndex, endpoint: 'start' },
            cw: rightIndex === undefined ? null : { primitiveIndex: rightIndex, endpoint: 'start' }
          });
        }

        if (pointOnTileBoundary(segment.sourceEnd, tilePolygon)) {
          wrappedBoundaryIncidences.push({
            sourceIndex: segment.sourceIndex,
            point: segment.sourceEnd,
            other: segment.sourceStart,
            ccw: rightIndex === undefined ? null : { primitiveIndex: rightIndex, endpoint: 'end' },
            cw: leftIndex === undefined ? null : { primitiveIndex: leftIndex, endpoint: 'end' }
          });
        }
      });
    }
  }

  return applyWrappedBoundaryJoins(
    applyInteriorJunctionJoins(output, interiorJunctionIncidences),
    wrappedBoundaryIncidences,
    options.tile
  );
}
