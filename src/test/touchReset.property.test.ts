import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createTouchController, type ActionName } from '../game/touchInput';

// Feature: capacitor-mobile-app, Property 9: Touch terminal events restore
// neutral input.
//
// For ANY combination of owned move/look/action contacts, applying a terminal
// event (pointercancel of every live pointer, window blur, app background, the
// typing gate, or a layout change) must drive the next frame read to fully
// neutral — no residual movement, look delta, or held action.

const ACTIONS: ActionName[] = ['primary', 'jump', 'place', 'use', 'sprint', 'handbrake'];

type Terminal = 'blur' | 'background' | 'typing' | 'layout' | 'cancelAll';

const NEUTRAL = {
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
};

describe('Feature: capacitor-mobile-app, Property 9: Touch terminal events restore neutral input', () => {
  it('any owned contact combination goes neutral after any terminal', () => {
    fc.assert(
      fc.property(
        fc.record({
          move: fc.boolean(),
          look: fc.boolean(),
          actions: fc.subarray(ACTIONS),
          terminal: fc.constantFrom<Terminal>('blur', 'background', 'typing', 'layout', 'cancelAll'),
          dx: fc.integer({ min: -300, max: 300 }),
          dy: fc.integer({ min: -300, max: 300 }),
        }),
        ({ move, look, actions, terminal, dx, dy }) => {
          const c = createTouchController();
          const live: number[] = [];
          let id = 1;

          if (move) {
            const mid = id++;
            live.push(mid);
            c.moveStart({ pointerId: mid, clientX: 0, clientY: 0 });
            c.movePointer({ pointerId: mid, clientX: dx, clientY: dy });
          }
          if (look) {
            const lid = id++;
            live.push(lid);
            c.lookStart({ pointerId: lid, clientX: 0, clientY: 0 });
            c.lookPointer({ pointerId: lid, clientX: dx, clientY: dy });
          }
          for (const a of actions) {
            const aid = id++;
            live.push(aid);
            c.actionDown(a, { pointerId: aid, clientX: 0, clientY: 0 });
          }

          switch (terminal) {
            case 'blur':
              c.blur();
              break;
            case 'background':
              c.setBackgrounded(true);
              break;
            case 'typing':
              c.setTyping(true);
              break;
            case 'layout':
              c.beginLayoutChange();
              break;
            case 'cancelAll':
              for (const p of live) c.pointerCancel(p);
              break;
          }

          const f = c.readFrame();
          expect(f).toEqual(NEUTRAL);
          // and no rising edge survives
          for (const a of ACTIONS) expect(c.consumeEdge(a)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
