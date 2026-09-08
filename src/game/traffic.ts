// Traffic light phases for the road intersection.
//
// The world has two crossing roads (see roads.ts): one along X at z ∈ [-3,-1]
// and one along Z at x ∈ [-3,-1], overlapping in the single intersection
// square x,z ∈ [-3,-1] (world region [-3, 0)).
//
// Light state is derived purely from wall-clock time, so every consumer
// (the TrafficLights meshes and the car AI) stays in sync with no shared
// mutable state — the same pattern as the smoke/bob animations elsewhere.

export type LightColor = 'green' | 'yellow' | 'red';
export type RoadAxis = 'x' | 'z';

const GREEN_SECS = 6;
const YELLOW_SECS = 2;
const HALF_CYCLE = GREEN_SECS + YELLOW_SECS;
export const CYCLE_SECS = HALF_CYCLE * 2;

// Light color for traffic travelling along the given road axis.
export function getLightColor(axis: RoadAxis, nowMs: number = performance.now()): LightColor {
  const t = (nowMs / 1000) % CYCLE_SECS;
  const activeAxis: RoadAxis = t < HALF_CYCLE ? 'x' : 'z';
  if (axis !== activeAxis) return 'red';
  const local = t < HALF_CYCLE ? t : t - HALF_CYCLE;
  return local < GREEN_SECS ? 'green' : 'yellow';
}

// Stop lines along a road axis (coordinates of the car centre, leaving room
// for the car nose to stay clear of the intersection square [-3, 0)).
// Approaching from the negative side (moving +) stop at -6; from the positive
// side (moving -) stop at +3.
export const STOP_LINE_NEG_APPROACH = -6;
export const STOP_LINE_POS_APPROACH = 3;

// Distance from the car to its stop line, positive while still approaching.
export function distanceToStopLine(coord: number, movingPositive: boolean): number {
  return movingPositive
    ? STOP_LINE_NEG_APPROACH - coord
    : coord - STOP_LINE_POS_APPROACH;
}
