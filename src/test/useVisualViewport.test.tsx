import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  useVisualViewport,
  writeSafeAreaVars,
  landscapeMinimumsMet,
  type ViewportMetrics,
} from '../hooks/useVisualViewport';

// A controllable fake of window.visualViewport for jsdom (which has none).
class FakeVisualViewport {
  width = 844;
  height = 390;
  offsetLeft = 0;
  offsetTop = 0;
  scale = 1;
  private listeners: Record<string, Array<() => void>> = {};
  addEventListener(type: string, cb: () => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== cb);
  }
  emit(type: string) {
    (this.listeners[type] ?? []).forEach((f) => f());
  }
  set(next: Partial<FakeVisualViewport>) {
    Object.assign(this, next);
    this.emit('resize');
  }
}

let fake: FakeVisualViewport;

beforeEach(() => {
  fake = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true, writable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('index.html viewport-fit', () => {
  it('declares viewport-fit=cover so the notch/safe areas are exposed', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');
    expect(html).toMatch(/viewport-fit=cover/);
  });
});

describe('useVisualViewport', () => {
  it('reports the current visual viewport dimensions and offsets', () => {
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current.width).toBe(844);
    expect(result.current.height).toBe(390);
    expect(result.current.offsetLeft).toBe(0);
    expect(result.current.offsetTop).toBe(0);
  });

  it('updates when the visual viewport resizes (e.g. software keyboard)', () => {
    const { result } = renderHook(() => useVisualViewport());
    act(() => {
      fake.set({ height: 200, offsetTop: 40 }); // keyboard shrinks + shifts
    });
    expect(result.current.height).toBe(200);
    expect(result.current.offsetTop).toBe(40);
  });

  it('reports orientation for both landscape shapes', () => {
    const { result, rerender } = renderHook(() => useVisualViewport());
    act(() => fake.set({ width: 844, height: 390 }));
    rerender();
    expect(result.current.orientation).toBe('landscape');
    act(() => fake.set({ width: 390, height: 844 }));
    rerender();
    expect(result.current.orientation).toBe('portrait');
  });
});

describe('writeSafeAreaVars', () => {
  it('writes safe-area CSS custom properties onto the root element', () => {
    const root = document.createElement('div');
    const metrics: ViewportMetrics = {
      width: 844,
      height: 390,
      offsetLeft: 12,
      offsetTop: 8,
      scale: 1,
      orientation: 'landscape',
    };
    writeSafeAreaVars(root, metrics);
    expect(root.style.getPropertyValue('--vvw')).toBe('844px');
    expect(root.style.getPropertyValue('--vvh')).toBe('390px');
    expect(root.style.getPropertyValue('--vv-offset-left')).toBe('12px');
    expect(root.style.getPropertyValue('--vv-offset-top')).toBe('8px');
  });
});

describe('landscapeMinimumsMet', () => {
  it('accepts both supported landscape rotations at/above the minimum', () => {
    expect(landscapeMinimumsMet({ width: 844, height: 390, offsetLeft: 0, offsetTop: 0, scale: 1, orientation: 'landscape' })).toBe(true);
    expect(landscapeMinimumsMet({ width: 852, height: 393, offsetLeft: 0, offsetTop: 0, scale: 1, orientation: 'landscape' })).toBe(true);
  });
  it('rejects a viewport below the landscape minimum', () => {
    expect(landscapeMinimumsMet({ width: 480, height: 320, offsetLeft: 0, offsetTop: 0, scale: 1, orientation: 'landscape' })).toBe(false);
  });
});
