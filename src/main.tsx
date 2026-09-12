import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { createRuntime, isNativePlatform } from './platform/nativeBootstrap';

// Bootstrap (task 13.5). On WEB this is exactly the prior behavior: render the
// app immediately; the native runtime adapters are all no-ops and no Capacitor
// plugin is imported. On NATIVE, gameplay input stays gated until the shell has
// locked orientation and hidden the status bar; the splash is hidden exactly
// once after React readiness AND one settled viewport frame; and a resume
// re-runs shell.prepare() so orientation/chrome are restored.

async function bootstrap(): Promise<void> {
  const root = createRoot(document.getElementById('root')!);
  const runtime = await createRuntime();

  const native = isNativePlatform();

  // On native, prepare the shell (orientation + status bar) BEFORE the first
  // frame gates input. A recoverable failure is retried on the next resume.
  if (native) {
    try {
      await runtime.shell.prepare();
    } catch {
      /* recoverable — a resume re-prepare (below) will retry */
    }
    // Re-prepare on every foreground so chrome/orientation are restored.
    runtime.events.onLifecycle((phase) => {
      if (phase === 'foreground') void runtime.shell.prepare().catch(() => {});
    });
  }

  const onReady = () => {
    // React has mounted and committed its first frame.
    void runtime.splash.markReactReady();
    // One settled viewport frame after paint, then the splash may hide.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => runtime.splash.markViewportSettled());
    });
  };

  root.render(<App onReady={onReady} />);
}

void bootstrap();
