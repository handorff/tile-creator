import { describe, expect, it } from 'vitest';
import { getSeedSnapPoints, getTilePolygon, tileBasisVectors } from './tile';

describe('tile geometry', () => {
  it('builds square polygon with 4 vertices', () => {
    const polygon = getTilePolygon({ shape: 'square', size: 10 });
    expect(polygon).toHaveLength(4);
    expect(polygon[0]).toEqual({ x: -10, y: -10 });
    expect(polygon[2]).toEqual({ x: 10, y: 10 });
  });

  it('builds pointy hex polygon with 6 vertices', () => {
    const polygon = getTilePolygon({ shape: 'hex-pointy', size: 10 });
    expect(polygon).toHaveLength(6);
    expect(polygon[0].y).toBeLessThan(0);
  });

  it('returns square basis vectors', () => {
    const { u, v } = tileBasisVectors({ shape: 'square', size: 12 });
    expect(u).toEqual({ x: 24, y: 0 });
    expect(v).toEqual({ x: 0, y: 24 });
  });

  it('returns hex basis vectors', () => {
    const { u, v } = tileBasisVectors({ shape: 'hex-pointy', size: 10 });
    expect(u.x).toBeCloseTo(Math.sqrt(3) * 10);
    expect(v.y).toBeCloseTo(15);
  });

  it('includes edge midpoints in seed snap points', () => {
    const seeds = getSeedSnapPoints({ shape: 'square', size: 10 });
    expect(seeds).toHaveLength(9);
    expect(seeds).toContainEqual({ x: 0, y: -10 });
    expect(seeds).toContainEqual({ x: 10, y: 0 });
    expect(seeds).toContainEqual({ x: 0, y: 10 });
    expect(seeds).toContainEqual({ x: -10, y: 0 });
  });
});
