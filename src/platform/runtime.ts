// Platform runtime interfaces (task 4.6). Every native capability the app needs
// is expressed as an injectable TypeScript interface so unit tests run without a
// native runtime, and the web build supplies no-op / browser-backed
// implementations. Plugin-backed native adapters are wired in phase 13.

export interface NativeShell {
  /** Lock orientation, hide the status bar, and settle layout before input. */
  prepare(): Promise<void>;
}

export interface NetworkStatus {
  connected: boolean;
}

export interface NetworkService {
  /** Attach connectivity listeners early in bootstrap. */
  attachListeners(onChange: (status: NetworkStatus) => void): void;
  getStatus(): Promise<NetworkStatus>;
}

/** Web shell: nothing to prepare — the browser owns orientation and chrome. */
export function createWebShell(): NativeShell {
  return {
    prepare: async () => {
      /* no-op on web */
    },
  };
}

/** Web network service backed by the browser's online/offline events. */
export function createWebNetwork(): NetworkService {
  return {
    attachListeners(onChange) {
      if (typeof window === 'undefined') return;
      const emit = () => onChange({ connected: navigator.onLine });
      window.addEventListener('online', emit);
      window.addEventListener('offline', emit);
    },
    getStatus: async () => ({
      connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
    }),
  };
}
