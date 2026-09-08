import { useCallback, useEffect, useState } from 'react';
import Game, { type GameMode } from './pages/Game';
import { LoginScreen } from './components/LoginScreen';
import {
  fetchLeaderboard,
  logout,
  resume,
  type Account,
  type LeaderboardEntry,
} from './game/account';

interface ModeCard {
  mode: GameMode;
  icon: string;
  title: string;
  desc: string;
  color: string;
  titleColor: string;
}

const MODES: ModeCard[] = [
  {
    mode: 'free',
    icon: '🧱',
    title: 'Free Play',
    desc: 'Build, explore, drive cars and fight zombies in your own world.',
    color: '#2e8b57',
    titleColor: '#8affc1',
  },
  {
    mode: 'multi',
    icon: '🌐',
    title: 'Multiplayer',
    desc: 'Explore a shared world — see other players building and driving with you!',
    color: '#1e6fd0',
    titleColor: '#7cc4ff',
  },
];

function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [booting, setBooting] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [mode, setMode] = useState<GameMode | null>(null);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);

  // Same computer -> same account: try a silent resume before prompting.
  useEffect(() => {
    let cancelled = false;
    resume()
      .then((existing) => {
        if (!cancelled) setAccount(existing);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshLeaders = useCallback(() => {
    fetchLeaderboard(10).then(setLeaders).catch(() => setLeaders([]));
  }, []);

  useEffect(() => {
    if (account && !mode) refreshLeaders();
  }, [account, mode, refreshLeaders]);

  const handleSwitchUser = async () => {
    await logout();
    setAccount(null);
    setSwitching(true);
  };

  if (booting) {
    return (
      <div style={shellStyle}>
        <div style={{ color: '#e8f4ff', fontFamily: 'monospace', fontSize: 16 }}>Loading…</div>
      </div>
    );
  }

  if (!account) {
    return (
      <LoginScreen
        onSignedIn={(signedIn) => {
          setAccount(signedIn);
          setSwitching(false);
        }}
        onCancel={switching ? () => setSwitching(false) : undefined}
      />
    );
  }

  if (mode) {
    return (
      <Game
        key={mode}
        mode={mode}
        account={account}
        onAccountChange={setAccount}
        onMenu={() => setMode(null)}
      />
    );
  }

  return (
    <div style={shellStyle}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 'clamp(34px, 7vw, 56px)',
            fontWeight: 'bold',
            color: '#fff',
            textShadow: '3px 3px 0 #2b2b2b, 6px 6px 0 rgba(0,0,0,0.25)',
            letterSpacing: 2,
          }}
        >
          ⛏️ CRAFTWORLD
        </div>
        <div
          style={{
            color: '#e8f4ff',
            marginTop: 8,
            fontSize: 15,
            textShadow: '1px 1px 0 rgba(0,0,0,0.4)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span>
            Signed in as <strong style={{ color: '#ffd76a' }}>{account.username}</strong>
          </span>
          <span style={{ color: '#cfe6ff' }}>· ⭐ best {account.bestScore}</span>
          <button
            type="button"
            onClick={handleSwitchUser}
            style={{
              background: 'rgba(0,0,0,0.35)',
              color: '#cfe0ee',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            switch user
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 980,
        }}
      >
        {MODES.map((m) => (
          <button
            key={m.mode}
            onClick={() => setMode(m.mode)}
            style={{
              width: 260,
              background: 'rgba(10, 15, 25, 0.82)',
              border: `3px solid ${m.color}`,
              borderRadius: 14,
              padding: '26px 20px',
              color: 'white',
              cursor: 'pointer',
              fontFamily: 'monospace',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              transition: 'transform 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <div style={{ fontSize: 44 }}>{m.icon}</div>
            <div style={{ fontSize: 19, fontWeight: 'bold', color: m.titleColor }}>{m.title}</div>
            <div style={{ fontSize: 12, color: '#b8c4d0', lineHeight: 1.5 }}>{m.desc}</div>
            <div
              style={{
                marginTop: 6,
                background: m.color,
                borderRadius: 8,
                padding: '8px 0',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              PLAY
            </div>
          </button>
        ))}
      </div>

      {leaders.length > 0 && (
        <div
          style={{
            background: 'rgba(10, 15, 25, 0.82)',
            border: '2px solid rgba(255,255,255,0.15)',
            borderRadius: 12,
            padding: '14px 18px',
            width: 'min(420px, 92vw)',
            fontFamily: 'monospace',
            color: 'white',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffd76a', marginBottom: 8 }}>
            🏆 Top players
          </div>
          {leaders.map((l) => (
            <div
              key={l.username}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                padding: '3px 0',
                color: l.username === account.username ? '#8affc1' : '#c8d4e0',
              }}
            >
              <span>
                {l.rank}. {l.username}
              </span>
              <span>
                ⭐ {l.bestScore} · {l.zombieKills} kills
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  background: 'linear-gradient(180deg, #87CEEB 0%, #4a90c2 55%, #2e5f36 55.2%, #1e401e 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'monospace',
  gap: 28,
  padding: 16,
  boxSizing: 'border-box',
  overflow: 'auto',
};

export default App;
