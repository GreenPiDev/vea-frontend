import { describe, expect, it } from "vitest";
import {
  LOOK_SMOOTHING_TIME,
  MAX_LOOK_PITCH,
  MOUSE_LOOK_SENSITIVITY,
  addMouseMovement,
  applyPitch,
  consumeLook,
  type PendingLook,
} from "./mouseLookSmoothing";

function run(pending: PendingLook, frames: number, delta: number) {
  const total = { yaw: 0, pitch: 0 };
  for (let i = 0; i < frames; i++) {
    const step = consumeLook(pending, delta);
    total.yaw += step.yaw;
    total.pitch += step.pitch;
  }
  return total;
}

describe("addMouseMovement", () => {
  it("turns left/up for negative movement and keeps PointerLockControls' sensitivity", () => {
    const p = { yaw: 0, pitch: 0 };
    addMouseMovement(p, 100, -50);
    expect(p.yaw).toBeCloseTo(-100 * MOUSE_LOOK_SENSITIVITY);
    expect(p.pitch).toBeCloseTo(50 * MOUSE_LOOK_SENSITIVITY);
  });
});

describe("consumeLook", () => {
  it("never loses or adds turn: everything pending is eventually applied", () => {
    const p = { yaw: 0.8, pitch: -0.3 };
    const total = run(p, 200, 1 / 60);
    expect(total.yaw).toBeCloseTo(0.8, 9);
    expect(total.pitch).toBeCloseTo(-0.3, 9);
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(0);
  });

  it("spreads a flick over several frames instead of applying it at once", () => {
    const p = { yaw: 1, pitch: 0 };
    const first = consumeLook(p, 1 / 60);
    expect(first.yaw).toBeGreaterThan(0.2);
    expect(first.yaw).toBeLessThan(0.5);
  });

  it("is frame-rate independent", () => {
    const at60 = run({ yaw: 1, pitch: 0 }, 6, 1 / 60);
    const at120 = run({ yaw: 1, pitch: 0 }, 12, 1 / 120);
    expect(at60.yaw).toBeCloseTo(at120.yaw, 9);
  });

  it("has applied ~95 % after three time constants", () => {
    const p = { yaw: 1, pitch: 0 };
    const total = run(p, 1, 3 * LOOK_SMOOTHING_TIME);
    expect(total.yaw).toBeCloseTo(1 - Math.exp(-3), 6);
  });

  it("applies everything at once with no smoothing", () => {
    const p = { yaw: 0.5, pitch: 0.2 };
    expect(consumeLook(p, 1 / 60, 0)).toEqual({ yaw: 0.5, pitch: 0.2 });
  });
});

describe("applyPitch", () => {
  it("clamps at the limit and drops the rest of the pending pitch", () => {
    const p = { yaw: 0, pitch: 0.5 };
    expect(applyPitch(MAX_LOOK_PITCH - 0.1, 0.3, p)).toBe(MAX_LOOK_PITCH);
    expect(p.pitch).toBe(0);
    expect(applyPitch(-MAX_LOOK_PITCH + 0.1, -0.3, { yaw: 0, pitch: -1 })).toBe(-MAX_LOOK_PITCH);
  });

  it("passes through inside the limits", () => {
    const p = { yaw: 0, pitch: 0.4 };
    expect(applyPitch(0.1, 0.2, p)).toBeCloseTo(0.3);
    expect(p.pitch).toBe(0.4);
  });
});
