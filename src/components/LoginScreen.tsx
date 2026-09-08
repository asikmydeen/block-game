import { useEffect, useState } from 'react';
import { login, suggestUsername, type Account } from '../game/account';

// Passwordless sign-in. A returning browser never sees this screen (App resumes
// via the stored device id); it appears on a new device, or when someone hits
// "switch user" to log into a different account by name.

interface LoginScreenProps {
  onSignedIn: (account: Account) => void;
  onCancel?: () => void;
}

export function LoginScreen({ onSignedIn, onCancel }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Offer a ready-made name so a new player can start with one click.
  useEffect(() => {
    let cancelled = false;
    suggestUsername()
      .then((name) => {
        if (!cancelled) setUsername((current) => current || name);
      })
      .catch(() => {
        /* leave the field empty; the player can type their own */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { account } = await login(trimmed);
      onSignedIn(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
      setBusy(false);
    }
  };

  const rollName = async () => {
    setError(null);
    try {
      setUsername(await suggestUsername());
    } catch {
      setError('Could not reach the server');
    }
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(180deg, #87CEEB 0%, #4a90c2 55%, #2e5f36 55.2%, #1e401e 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        gap: 24,
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 'clamp(30px, 6vw, 50px)',
            fontWeight: 'bold',
            color: '#fff',
            textShadow: '3px 3px 0 #2b2b2b, 6px 6px 0 rgba(0,0,0,0.25)',
            letterSpacing: 2,
          }}
        >
          ⛏️ CRAFTWORLD
        </div>
        <div style={{ color: '#e8f4ff', marginTop: 8, fontSize: 14, textShadow: '1px 1px 0 rgba(0,0,0,0.4)' }}>
          Pick a username to save your progress
        </div>
      </div>

      <div
        style={{
          background: 'rgba(10, 15, 25, 0.85)',
          border: '3px solid #2e8b57',
          borderRadius: 14,
          padding: '24px 26px',
          width: 'min(420px, 92vw)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          color: 'white',
          boxSizing: 'border-box',
        }}
      >
        <label htmlFor="bg-username" style={{ fontSize: 13, color: '#8affc1', fontWeight: 'bold' }}>
          Username
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="bg-username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit(username);
            }}
            placeholder="BlockyMiner42"
            aria-describedby="bg-username-hint"
            style={{
              flex: 1,
              minWidth: 0,
              background: '#0d0d1a',
              border: `1px solid ${error ? '#ff6b5a' : '#555'}`,
              borderRadius: 8,
              padding: '11px 12px',
              color: 'white',
              fontSize: 16,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={rollName}
            title="Suggest a username"
            aria-label="Suggest a username"
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 8,
              padding: '0 14px',
              fontSize: 18,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            🎲
          </button>
        </div>

        <div id="bg-username-hint" style={{ fontSize: 11, color: '#8a94a5', lineHeight: 1.5 }}>
          3–16 characters: letters, numbers, <code>_</code> or <code>-</code>. No password needed — this browser will
          remember you next time. Type an existing username to pick that account back up.
        </div>

        {error && (
          <div role="alert" style={{ fontSize: 12, color: '#ff9b8f' }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => submit(username)}
          disabled={busy || !username.trim()}
          style={{
            marginTop: 4,
            background: busy || !username.trim() ? 'rgba(255,255,255,0.12)' : '#2e8b57',
            color: busy || !username.trim() ? '#888' : 'white',
            border: 'none',
            borderRadius: 8,
            padding: '12px 0',
            fontSize: 15,
            fontWeight: 'bold',
            cursor: busy || !username.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {busy ? 'Signing in…' : 'Play'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: '#9fb0c0',
              border: 'none',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'monospace',
              padding: 4,
            }}
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
