import { describe, expect, it } from 'vitest';
import { IDENTITY, ZOOM_MAX, clampPan, clampScale, screenToLocalDelta, zoomAbout } from './zoomPan';

describe('zoomPan', () => {
  it('clamps scale to the allowed range', () => {
    expect(clampScale(0.3)).toBe(1);
    expect(clampScale(99)).toBe(ZOOM_MAX);
    expect(clampScale(2)).toBe(2);
  });

  it('zooming about the centre does not pan', () => {
    expect(zoomAbout(IDENTITY, 2, 0, 0)).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it('keeps the pinched point fixed on screen', () => {
    // A content point at local (100, 50) sits on screen at state.x + p * scale.
    const s = zoomAbout(IDENTITY, 2, 100, 50);
    const contentPoint = { x: (100 - IDENTITY.x) / IDENTITY.scale, y: (50 - IDENTITY.y) / IDENTITY.scale };
    expect(s.x + contentPoint.x * s.scale).toBeCloseTo(100);
    expect(s.y + contentPoint.y * s.scale).toBeCloseTo(50);
  });

  it('cannot pan past the image edges', () => {
    expect(clampPan({ scale: 2, x: 500, y: -500 }, 400, 300)).toEqual({ scale: 2, x: 200, y: -150 });
    expect(clampPan({ scale: 1, x: 30, y: 30 }, 400, 300)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('maps screen drags into the rotated landscape view', () => {
    expect(screenToLocalDelta(10, 20, false)).toEqual({ x: 10, y: 20 });
    // Rotated 90° clockwise: finger down the screen → content +x; finger right → content -y.
    expect(screenToLocalDelta(0, 20, true)).toEqual({ x: 20, y: -0 });
    expect(screenToLocalDelta(10, 0, true)).toEqual({ x: 0, y: -10 });
  });
});
