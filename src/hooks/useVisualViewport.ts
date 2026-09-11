import { useEffect, useState, type CSSProperties } from 'react';

// Visual-viewport shell for the mobile web/native build.
//
// `window.visualViewport` reports the region actually visible to the user after
// the software keyboard, browser chrome, and pinch-zoom are accounted for —
// unlike `window.innerHeight`, which does not shrink for the keyboard on iOS.
// The game reads these metrics to keep the HUD inside the safe area, to bound
// oversized modals to the visible height, and to detect the layout changes that
// gate gameplay input (task 11).

export type Orientation = 'landscape' | 'portrait';

export interface ViewportMetrics {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  scale: number;
  orientation: Orientation;
}

// Primary touch targets follow the platform 44–48px guidance; we use 48 so the
// same value satisfies both iOS and Android accessibility checks.
export const TARGET_MIN_PX = 48;
export const TARGET_GAP_PX = 8;

// Landscape minimum matches the smallest supported device (iPhone 13 mini in
// landscape is 812×375; Pixel 7 is larger). We accept anything at/above that.
const LANDSCAPE_MIN_WIDTH = 812;
const LANDSCAPE_MIN_HEIGHT = 360;

function readMetrics(): ViewportMetrics {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const width = vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
  const height = vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
  return {
    width,
    height,
    offsetLeft: vv?.offsetLeft ?? 0,
    offsetTop: vv?.offsetTop ?? 0,
    scale: vv?.scale ?? 1,
    orientation: width >= height ? 'landscape' : 'portrait',
  };
}

export function useVisualViewport(): ViewportMetrics {
  const [metrics, setMetrics] = useState<ViewportMetrics>(readMetrics);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const update = () => setMetrics(readMetrics());
    update();
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      if (vv) {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      }
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return metrics;
}

// Mirror the current visual-viewport metrics into CSS custom properties so the
// stylesheet and inline styles can size against the truly-visible region.
export function writeSafeAreaVars(root: HTMLElement, m: ViewportMetrics): void {
  root.style.setProperty('--vvw', `${m.width}px`);
  root.style.setProperty('--vvh', `${m.height}px`);
  root.style.setProperty('--vv-offset-left', `${m.offsetLeft}px`);
  root.style.setProperty('--vv-offset-top', `${m.offsetTop}px`);
}

export function landscapeMinimumsMet(m: ViewportMetrics): boolean {
  if (m.orientation !== 'landscape') return false;
  return m.width >= LANDSCAPE_MIN_WIDTH && m.height >= LANDSCAPE_MIN_HEIGHT;
}

// ── Shared style helpers used by every touch control and modal ──────────────

export function primaryTargetStyle(): CSSProperties {
  return {
    minWidth: `${TARGET_MIN_PX}px`,
    minHeight: `${TARGET_MIN_PX}px`,
  };
}

// Bound an oversized modal to the visible viewport height (var written by
// writeSafeAreaVars, falling back to dvh) and make it scroll rather than
// overflow behind the software keyboard.
export function scrollBoundedModalStyle(): CSSProperties {
  return {
    maxHeight: 'calc(var(--vvh, 100dvh) - 24px)',
    overflowY: 'auto',
  };
}

// Applied only to gameplay controls (joystick, look pad, action buttons) so the
// browser does not hijack a drag as text selection, a context menu, an
// overscroll bounce, or an edge-swipe navigation gesture.
export function gameplayGestureStyle(): CSSProperties {
  return {
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    overscrollBehavior: 'none',
  } as CSSProperties;
}

// A shared safe-area cluster: absolutely-positioned container that respects the
// device insets on the given edges. Controls and HUD groups compose this so
// insets are handled in one place.
export function safeAreaClusterStyle(
  edges: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean } = {},
): CSSProperties {
  const s: CSSProperties = { position: 'fixed' };
  if (edges.top) s.top = 'calc(10px + env(safe-area-inset-top))';
  if (edges.bottom) s.bottom = 'calc(10px + env(safe-area-inset-bottom))';
  if (edges.left) s.left = 'max(10px, env(safe-area-inset-left))';
  if (edges.right) s.right = 'max(10px, env(safe-area-inset-right))';
  return s;
}
