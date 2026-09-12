import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTouchController,
  type TouchController,
} from './touchInput';

// A minimal fake pointer element that records setPointerCapture /
// releasePointerCapture so we can assert per-pointer ownership without a real
// DOM. The controller only needs these two methods plus the event shape.
function fakeTarget() {
  const captured = new Set<number>();
  return {
    captured,
    setPointerCapture(id: number) {
      captured.add(id);
    },
    releasePointerCapture(id: number) {
      captured.delete(id);
    },
  };
}

interface PtrOpts {
  pointerId: number;
  clientX?: number;
  clientY?: number;
  target?: ReturnType<typeof fakeTarget>;
}

function ptr(o: PtrOpts) {
  const target = o.target ?? fakeTarget();
  return {
    pointerId: o.pointerId,
    clientX: o.clientX ?? 0,
    clientY: o.clientY ?? 0,
    target,
    preventDefault() {},
  };
}

describe('touchInput controller', () => {
  let c: TouchController;
  beforeEach(() => {
    c = createTouchController();
  });

  it('starts fully neutral', () => {
    const f = c.readFrame();
    expect(f.moveX).toBe(0);
    expect(f.moveY).toBe(0);
    expect(f.lookDX).toBe(0);
    expect(f.lookDY).toBe(0);
    expect(f.sprint).toBe(false);
    expect(f.primary).toBe(false);
    expect(f.jump).toBe(false);
    expect(f.place).toBe(false);
    expect(f.handbrake).toBe(false);
  });

  it('tracks the move joystick by its own pointer id and clamps to unit circle', () => {
    const t = fakeTarget();
    c.moveStart(ptr({ pointerId: 1, clientX: 100, clientY: 100, target: t }));
    expect(t.captured.has(1)).toBe(true);
    // pull far right+up
    c.movePointer(ptr({ pointerId: 1, clientX: 400, clientY: 100, target: t }));
    const f = c.readFrame();
    expect(f.moveX).toBeGreaterThan(0);
    expect(Math.hypot(f.moveX, f.moveY)).toBeLessThanOrEqual(1.0001);
    // a different pointer id must not steer the joystick
    c.movePointer(ptr({ pointerId: 2, clientX: 0, clientY: 400, target: t }));
    expect(c.readFrame().moveX).toBe(f.moveX);
  });

  it('accumulates look delta from an independent look pointer and neutralizes on read', () => {
    c.lookStart(ptr({ pointerId: 5, clientX: 200, clientY: 200 }));
    c.lookPointer(ptr({ pointerId: 5, clientX: 230, clientY: 210 }));
    c.lookPointer(ptr({ pointerId: 5, clientX: 240, clientY: 205 }));
    const f = c.readFrame();
    expect(f.lookDX).toBe(40);
    expect(f.lookDY).toBe(5);
    // next frame with no motion is neutral (deltas consumed)
    const f2 = c.readFrame();
    expect(f2.lookDX).toBe(0);
    expect(f2.lookDY).toBe(0);
  });

  it('supports simultaneous move + look + one action with independent pointer ids', () => {
    c.moveStart(ptr({ pointerId: 1, clientX: 100, clientY: 100 }));
    c.movePointer(ptr({ pointerId: 1, clientX: 140, clientY: 100 }));
    c.lookStart(ptr({ pointerId: 2, clientX: 300, clientY: 300 }));
    c.lookPointer(ptr({ pointerId: 2, clientX: 320, clientY: 300 }));
    c.actionDown('primary', ptr({ pointerId: 3 }));
    const f = c.readFrame();
    expect(f.moveX).toBeGreaterThan(0);
    expect(f.lookDX).toBe(20);
    expect(f.primary).toBe(true);
  });

  it('holds pressed action state until released (level) and exposes a rising edge', () => {
    c.actionDown('primary', ptr({ pointerId: 9 }));
    expect(c.readFrame().primary).toBe(true);
    expect(c.consumeEdge('primary')).toBe(true); // first observation is a rising edge
    expect(c.consumeEdge('primary')).toBe(false); // still held, no new edge
    expect(c.readFrame().primary).toBe(true); // level stays true while held
    c.actionUp('primary', ptr({ pointerId: 9 }));
    expect(c.readFrame().primary).toBe(false);
  });

  it('routes jump / place / sprint / handbrake to distinct latches', () => {
    c.actionDown('jump', ptr({ pointerId: 1 }));
    c.actionDown('place', ptr({ pointerId: 2 }));
    c.actionDown('sprint', ptr({ pointerId: 3 }));
    c.actionDown('handbrake', ptr({ pointerId: 4 }));
    const f = c.readFrame();
    expect(f.jump).toBe(true);
    expect(f.place).toBe(true);
    expect(f.sprint).toBe(true);
    expect(f.handbrake).toBe(true);
  });

  it('releases pointer capture and neutralizes that contact on lostpointercapture', () => {
    const t = fakeTarget();
    c.moveStart(ptr({ pointerId: 1, clientX: 0, clientY: 0, target: t }));
    c.movePointer(ptr({ pointerId: 1, clientX: 90, clientY: 0, target: t }));
    expect(c.readFrame().moveX).toBeGreaterThan(0);
    c.lostPointerCapture(1);
    expect(t.captured.has(1)).toBe(false);
    expect(c.readFrame().moveX).toBe(0);
  });

  it('pointercancel on an action pointer clears just that action', () => {
    c.actionDown('primary', ptr({ pointerId: 7 }));
    c.actionDown('jump', ptr({ pointerId: 8 }));
    c.pointerCancel(7);
    const f = c.readFrame();
    expect(f.primary).toBe(false);
    expect(f.jump).toBe(true);
  });

  it('resetAll() returns every contact/latch to neutral', () => {
    c.moveStart(ptr({ pointerId: 1, clientX: 0, clientY: 0 }));
    c.movePointer(ptr({ pointerId: 1, clientX: 90, clientY: 0 }));
    c.lookStart(ptr({ pointerId: 2, clientX: 0, clientY: 0 }));
    c.lookPointer(ptr({ pointerId: 2, clientX: 40, clientY: 0 }));
    c.actionDown('primary', ptr({ pointerId: 3 }));
    c.actionDown('sprint', ptr({ pointerId: 4 }));
    c.resetAll();
    const f = c.readFrame();
    expect(f).toEqual({
      moveX: 0,
      moveY: 0,
      lookDX: 0,
      lookDY: 0,
      sprint: false,
      primary: false,
      jump: false,
      place: false,
      use: false,
      handbrake: false,
    });
    expect(c.consumeEdge('primary')).toBe(false);
  });

  it('blur is a terminal that resets to neutral', () => {
    c.actionDown('primary', ptr({ pointerId: 1 }));
    c.moveStart(ptr({ pointerId: 2, clientX: 0, clientY: 0 }));
    c.movePointer(ptr({ pointerId: 2, clientX: 80, clientY: 0 }));
    c.blur();
    const f = c.readFrame();
    expect(f.primary).toBe(false);
    expect(f.moveX).toBe(0);
  });

  it('background (visibility hidden) is a terminal that resets to neutral', () => {
    c.actionDown('jump', ptr({ pointerId: 1 }));
    c.setBackgrounded(true);
    expect(c.readFrame().jump).toBe(false);
  });

  it('typing gate: while typing, inputs are neutralized and new presses ignored', () => {
    c.actionDown('primary', ptr({ pointerId: 1 }));
    c.setTyping(true);
    expect(c.readFrame().primary).toBe(false);
    // presses during typing do nothing
    c.actionDown('primary', ptr({ pointerId: 2 }));
    expect(c.readFrame().primary).toBe(false);
    c.setTyping(false);
    // still neutral until a fresh press after the gate closes
    expect(c.readFrame().primary).toBe(false);
    c.actionDown('primary', ptr({ pointerId: 3 }));
    expect(c.readFrame().primary).toBe(true);
  });

  it('layout gate neutralizes reads and reopens only after two stable frames', () => {
    c.actionDown('jump', ptr({ pointerId: 1 }));
    c.beginLayoutChange();
    expect(c.readFrame().jump).toBe(false);
    c.endLayoutChange(); // requests reopen; needs two stable frames
    // frame 1 after layout: still gated
    c.tickStableFrame();
    expect(c.isInputOpen()).toBe(false);
    // frame 2 after layout: open
    c.tickStableFrame();
    expect(c.isInputOpen()).toBe(true);
  });
});
