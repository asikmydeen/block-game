import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TARGET_MIN_PX,
  TARGET_GAP_PX,
  primaryTargetStyle,
  scrollBoundedModalStyle,
  gameplayGestureStyle,
} from '../hooks/useVisualViewport';

// 11.1: safe-area layout contract that does not require a full Canvas mount.
// These assert the shared style helpers every touch control/modal uses.

describe('safe-area layout contract', () => {
  it('index.css defines safe-area root variables and disables overscroll globally', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8');
    expect(css).toMatch(/env\(safe-area-inset/);
    expect(css).toMatch(/overscroll-behavior/);
  });

  it('primary touch targets are at least 48x48', () => {
    expect(TARGET_MIN_PX).toBeGreaterThanOrEqual(48);
    const s = primaryTargetStyle();
    expect(parseInt(String(s.minWidth), 10)).toBeGreaterThanOrEqual(48);
    expect(parseInt(String(s.minHeight), 10)).toBeGreaterThanOrEqual(48);
  });

  it('primary targets keep at least 8px separation', () => {
    expect(TARGET_GAP_PX).toBeGreaterThanOrEqual(8);
  });

  it('oversized modals are scrollable within the visual viewport bounds', () => {
    const s = scrollBoundedModalStyle();
    expect(s.overflowY).toBe('auto');
    // bounded to the visual viewport height variable, not 100vh
    expect(String(s.maxHeight)).toContain('--vvh');
  });

  it('gameplay controls suppress selection, context menu, overscroll and nav gestures', () => {
    const s = gameplayGestureStyle();
    expect(s.touchAction).toBe('none');
    expect(s.userSelect).toBe('none');
    expect(String(s.overscrollBehavior)).toBe('none');
    expect(String(s.WebkitTouchCallout)).toBe('none');
  });
});
