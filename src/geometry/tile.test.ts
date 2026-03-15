import { describe, expect, it } from 'vitest';
import { getPatternBounds, getSeedSnapPoints, getTilePolygon, tileBasisVectors } from './tile';

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

  it('uses tile bounding-box width and height for pattern bounds', () => {
    const bounds = getPatternBounds({ shape: 'square', size: 10 }, { columns: 3, rows: 2 });

    expect(bounds).toEqual({
      minX: -10,
      minY: -10,
      maxX: 50,
      maxY: 30
    });
  });

  it('keeps hex pattern width tied to selected columns rather than slanted row offsets', () => {
    const size = 10;
    const bounds = getPatternBounds({ shape: 'hex-pointy', size }, { columns: 4, rows: 3 });

    expect(bounds.minX).toBeCloseTo((-Math.sqrt(3) * size) / 2);
    expect(bounds.maxX - bounds.minX).toBeCloseTo(Math.sqrt(3) * size * 4);
    expect(bounds.maxY - bounds.minY).toBeCloseTo(size * 2 + size * 1.5 * 2);
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
