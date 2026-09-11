// Pointer-capture touch controller.
//
// Replaces the old module-level `touchState` singleton in TouchControls.tsx
// with a proper controller that owns each gameplay contact by its own pointer
// id. Continuous state (joystick, look delta) and discrete latches (primary,
// jump, place, use, sprint, handbrake) live here — NOT in React state — so the
// render loop reads them once per frame with `readFrame()` and nothing about a
// held control forces a React commit. Only "which buttons look pressed" belongs
// in component state.
//
// Every terminal path an OS/browser can throw at a touch surface — pointer
// cancel, lost capture, window blur, tab/app background — plus the app's own
// typing and layout gates converges on neutral input, which is what Property 9
// proves.

const JOY_RADIUS = 50;

export type ActionName = 'primary' | 'jump' | 'place' | 'use' | 'sprint' | 'handbrake';

export interface TouchFrame {
  moveX: number;
  moveY: number;
  lookDX: number;
  lookDY: number;
  sprint: boolean;
  primary: boolean;
  jump: boolean;
  place: boolean;
  use: boolean;
  handbrake: boolean;
}

// The controller only needs these members off a pointer event, so tests can
// pass a tiny fake instead of a full DOM PointerEvent.
export interface PointerLike {
  pointerId: number;
  clientX: number;
  clientY: number;
  target?: {
    setPointerCapture?: (id: number) => void;
    releasePointerCapture?: (id: number) => void;
  } | null;
  preventDefault?: () => void;
}

export interface TouchController {
  // move joystick
  moveStart(e: PointerLike): void;
  movePointer(e: PointerLike): void;
  moveEnd(id: number): void;
  /** Set already-normalized move axes directly (-1..1), for a joystick that does
   *  its own geometry. Respects the input gates. */
  setMove(x: number, y: number): void;
  // look pad
  lookStart(e: PointerLike): void;
  lookPointer(e: PointerLike): void;
  lookEnd(id: number): void;
  // discrete actions
  actionDown(name: ActionName, e: PointerLike): void;
  actionUp(name: ActionName, e: PointerLike): void;
  // per-frame consumption
  readFrame(): TouchFrame;
  /** Non-consuming snapshot: same shape as readFrame() but does NOT clear the
   *  look-delta accumulator. Used by the compatibility view whose getters are
   *  read multiple times per frame. */
  peek(): TouchFrame;
  consumeEdge(name: ActionName): boolean;
  // terminals / gates
  pointerCancel(id: number): void;
  lostPointerCapture(id: number): void;
  blur(): void;
  setBackgrounded(bg: boolean): void;
  setTyping(typing: boolean): void;
  beginLayoutChange(): void;
  endLayoutChange(): void;
  tickStableFrame(): void;
  isInputOpen(): boolean;
  resetAll(): void;
}

const NEUTRAL: TouchFrame = {
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

const STABLE_FRAMES_REQUIRED = 2;

export function createTouchController(): TouchController {
  // continuous
  let moveX = 0;
  let moveY = 0;
  let lookDX = 0;
  let lookDY = 0;

  // pointer ownership
  let movePointerId: number | null = null;
  let lookPointerId: number | null = null;
  let lastLookX = 0;
  let lastLookY = 0;

  // action latches -> owning pointer id (null = not held)
  const held: Record<ActionName, number | null> = {
    primary: null,
    jump: null,
    place: null,
    use: null,
    sprint: null,
    handbrake: null,
  };
  // rising-edge flags, set on down, cleared by consumeEdge
  const edge: Record<ActionName, boolean> = {
    primary: false,
    jump: false,
    place: false,
    use: false,
    sprint: false,
    handbrake: false,
  };

  // remember which element captured each pointer so terminals can release it
  const capturedBy = new Map<number, NonNullable<PointerLike['target']>>();

  // gates
  let typing = false;
  let backgrounded = false;
  let layoutChanging = false;
  let framesSinceLayout = STABLE_FRAMES_REQUIRED; // start open

  function gated(): boolean {
    return typing || backgrounded || !inputOpen();
  }

  function inputOpen(): boolean {
    return !layoutChanging && framesSinceLayout >= STABLE_FRAMES_REQUIRED;
  }

  function capture(e: PointerLike) {
    e.preventDefault?.();
    if (e.target) capturedBy.set(e.pointerId, e.target);
    e.target?.setPointerCapture?.(e.pointerId);
  }

  function release(id: number) {
    const target = capturedBy.get(id);
    target?.releasePointerCapture?.(id);
    capturedBy.delete(id);
  }

  function clearPointer(id: number) {
    if (movePointerId === id) {
      movePointerId = null;
      moveX = 0;
      moveY = 0;
    }
    if (lookPointerId === id) {
      lookPointerId = null;
      lookDX = 0;
      lookDY = 0;
    }
    (Object.keys(held) as ActionName[]).forEach((name) => {
      if (held[name] === id) {
        held[name] = null;
        edge[name] = false;
      }
    });
  }

  function neutralize() {
    moveX = 0;
    moveY = 0;
    lookDX = 0;
    lookDY = 0;
    movePointerId = null;
    lookPointerId = null;
    (Object.keys(held) as ActionName[]).forEach((name) => {
      held[name] = null;
      edge[name] = false;
    });
    capturedBy.forEach((target, id) => target?.releasePointerCapture?.(id));
    capturedBy.clear();
  }

  function setJoystick(e: PointerLike) {
    // clientX/Y are treated as offset from the joystick center for tests; a
    // real base element supplies center-relative coords the same way.
    let dx = e.clientX - joyOriginX;
    let dy = e.clientY - joyOriginY;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) {
      dx = (dx / dist) * JOY_RADIUS;
      dy = (dy / dist) * JOY_RADIUS;
    }
    moveX = dx / JOY_RADIUS;
    moveY = -dy / JOY_RADIUS;
  }

  let joyOriginX = 0;
  let joyOriginY = 0;

  return {
    moveStart(e) {
      if (gated() || movePointerId !== null) return;
      movePointerId = e.pointerId;
      joyOriginX = e.clientX;
      joyOriginY = e.clientY;
      moveX = 0;
      moveY = 0;
      capture(e);
    },
    movePointer(e) {
      if (movePointerId !== e.pointerId) return;
      if (gated()) return;
      setJoystick(e);
    },
    moveEnd(id) {
      if (movePointerId === id) {
        movePointerId = null;
        moveX = 0;
        moveY = 0;
      }
    },
    setMove(x, y) {
      if (gated()) {
        moveX = 0;
        moveY = 0;
        return;
      }
      moveX = x;
      moveY = y;
    },

    lookStart(e) {
      if (gated() || lookPointerId !== null) return;
      lookPointerId = e.pointerId;
      lastLookX = e.clientX;
      lastLookY = e.clientY;
      capture(e);
    },
    lookPointer(e) {
      if (lookPointerId !== e.pointerId) return;
      if (gated()) return;
      lookDX += e.clientX - lastLookX;
      lookDY += e.clientY - lastLookY;
      lastLookX = e.clientX;
      lastLookY = e.clientY;
    },
    lookEnd(id) {
      if (lookPointerId === id) lookPointerId = null;
    },

    actionDown(name, e) {
      if (gated()) return;
      if (held[name] === null) edge[name] = true;
      held[name] = e.pointerId;
      capture(e);
    },
    actionUp(name, e) {
      if (held[name] === e.pointerId) held[name] = null;
    },

    readFrame() {
      if (gated()) return { ...NEUTRAL };
      const f: TouchFrame = {
        moveX,
        moveY,
        lookDX,
        lookDY,
        sprint: held.sprint !== null,
        primary: held.primary !== null,
        jump: held.jump !== null,
        place: held.place !== null,
        use: held.use !== null,
        handbrake: held.handbrake !== null,
      };
      // look delta is a per-frame accumulator: consumed on read
      lookDX = 0;
      lookDY = 0;
      return f;
    },
    peek() {
      if (gated()) return { ...NEUTRAL };
      return {
        moveX,
        moveY,
        lookDX,
        lookDY,
        sprint: held.sprint !== null,
        primary: held.primary !== null,
        jump: held.jump !== null,
        place: held.place !== null,
        use: held.use !== null,
        handbrake: held.handbrake !== null,
      };
    },
    consumeEdge(name) {
      if (gated()) return false;
      if (edge[name]) {
        edge[name] = false;
        return true;
      }
      return false;
    },

    pointerCancel(id) {
      release(id);
      clearPointer(id);
    },
    lostPointerCapture(id) {
      release(id);
      clearPointer(id);
    },
    blur() {
      neutralize();
    },
    setBackgrounded(bg) {
      backgrounded = bg;
      if (bg) neutralize();
    },
    setTyping(t) {
      typing = t;
      if (t) neutralize();
    },
    beginLayoutChange() {
      layoutChanging = true;
      framesSinceLayout = 0;
      neutralize();
    },
    endLayoutChange() {
      layoutChanging = false;
      framesSinceLayout = 0;
    },
    tickStableFrame() {
      if (!layoutChanging && framesSinceLayout < STABLE_FRAMES_REQUIRED) {
        framesSinceLayout += 1;
      }
    },
    isInputOpen() {
      return inputOpen();
    },
    resetAll() {
      neutralize();
    },
  };
}
