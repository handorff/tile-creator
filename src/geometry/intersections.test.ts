import { describe, expect, it } from 'vitest';
import { intersections } from './intersections';
import type { Primitive } from '../types/model';

describe('intersections', () => {
  it('finds line-line intersection', () => {
    const primitives: Primitive[] = [
      {
        id: 'a',
        kind: 'line',
        a: { x: -10, y: 0 },
        b: { x: 10, y: 0 },
        color: '#000'
      },
      {
        id: 'b',
        kind: 'line',
        a: { x: 0, y: -10 },
        b: { x: 0, y: 10 },
        color: '#000'
      }
    ];

    const pts = intersections(primitives);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(0);
  });

  it('finds line-circle intersections', () => {
    const primitives: Primitive[] = [
      {
        id: 'a',
        kind: 'line',
        a: { x: -10, y: 0 },
        b: { x: 10, y: 0 },
        color: '#000'
      },
      {
        id: 'c',
        kind: 'circle',
        center: { x: 0, y: 0 },
        radius: 5,
        color: '#000'
      }
    ];

    const pts = intersections(primitives);
    expect(pts).toHaveLength(2);
  });

  it('filters intersections to the arc sweep', () => {
    const primitives: Primitive[] = [
      {
        id: 'line-1',
        kind: 'line',
        a: { x: -10, y: 0 },
        b: { x: 10, y: 0 },
        color: '#000'
      },
      {
        id: 'arc-1',
        kind: 'arc',
        center: { x: 0, y: 0 },
        start: { x: 0, y: -5 },
        end: { x: 0, y: 5 },
        clockwise: true,
        largeArc: false,
        color: '#000'
      }
    ];

    const pts = intersections(primitives);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(5, 6);
    expect(pts[0].y).toBeCloseTo(0, 6);
  });
});
