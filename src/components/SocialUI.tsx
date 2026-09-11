import { useEffect, useRef, useState } from 'react';
import {
  EMOTES,
  sendChat,
  sendEmote,
  useMultiplayer,
  type EmoteName,
} from '../game/multiplayer';

const mono = 'monospace';

// ── Chat ──────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  myUsername: string;
}

export function ChatPanel({ open, onClose, myUsername }: ChatPanelProps) {
  const { chat } = useMultiplayer();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [chat.length, open]);

  // When closed, only show the last few lines and fade out older ones so chat
  // never blocks the view while playing.
  const visible = open ? chat.slice(-40) : chat.slice(-5);

  const submit = () => {
    if (draft.trim()) sendChat(draft);
    setDraft('');
    onClose();
  };

  if (!open && visible.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 140,
        width: 'min(420px, 60vw)',
        zIndex: 220,
        fontFamily: mono,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div
        ref={logRef}
        style={{
          maxHeight: open ? 240 : 110,
          overflowY: open ? 'auto' : 'hidden',
          background: open ? 'rgba(0,0,0,0.62)' : 'transparent',
          borderRadius: 8,
          padding: open ? '8px 10px' : '0 2px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {visible.map((m) => (
          <div
            key={m.id}
            style={{
              fontSize: 12.5,
              lineHeight: 1.45,
              textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
              color: m.system ? '#8a94a5' : '#eef4fb',
              opacity: open ? 1 : 0.9,
            }}
          >
            {!m.system && (
              <span style={{ color: m.from === myUsername ? '#8affc1' : m.color, fontWeight: 'bold' }}>
                {m.from}:{' '}
              </span>
            )}
            <span>{m.text}</span>
          </div>
        ))}
      </div>

      {open && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            ref={inputRef}
            value={draft}
            maxLength={180}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Keep game bindings from firing while typing.
              e.stopPropagation();
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') {
                setDraft('');
                onClose();
              }
            }}
            placeholder="Say something…  (Enter to send, Esc to cancel)"
            aria-label="Chat message"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'rgba(6,10,18,0.92)',
              border: '1px solid #3d4a5c',
              borderRadius: 8,
              padding: '9px 11px',
              color: 'white',
              fontSize: 13,
              fontFamily: mono,
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={submit}
            style={{
              background: '#2e8b57',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 'bold',
              cursor: 'pointer',
              fontFamily: mono,
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

// ── Event feed (joins, leaves, kills, emotes) ─────────────────────────────

export function EventFeed() {
  const { events } = useMultiplayer();
  const [now, setNow] = useState(Date.now());

  // Tick so entries can age out of view.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const recent = events.filter((e) => now - e.ts < 9000).slice(-5);
  if (recent.length === 0) return null;

  const tint = (kind: string) =>
    kind === 'join' ? '#8affc1' : kind === 'leave' ? '#ff9b8f' : kind === 'kill' ? '#ffd76a' : '#cfe0ee';

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: 150,
        zIndex: 120,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'flex-end',
        pointerEvents: 'none',
        fontFamily: mono,
      }}
    >
      {recent.map((e) => (
        <div
          key={e.id}
          style={{
            background: 'rgba(0,0,0,0.5)',
            color: tint(e.kind),
            fontSize: 11.5,
            padding: '4px 9px',
            borderRadius: 6,
            textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
          }}
        >
          {e.text}
        </div>
      ))}
    </div>
  );
}

// ── Online players ────────────────────────────────────────────────────────

export function PlayersPanel({ open, myUsername, myScore }: { open: boolean; myUsername: string; myScore: number }) {
  const { others, status } = useMultiplayer();
  if (!open) return null;

  const rows = [
    { id: 'me', name: myUsername, score: myScore, color: '#8affc1', isMe: true },
    ...others.map((o) => ({ id: o.id, name: o.name, score: o.score, color: o.color, isMe: false })),
  ].sort((a, b) => b.score - a.score);

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(6,10,18,0.9)',
        border: '2px solid rgba(255,255,255,0.18)',
        borderRadius: 12,
        padding: '16px 20px',
        minWidth: 300,
        zIndex: 260,
        fontFamily: mono,
        color: 'white',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 'bold', color: '#aef', marginBottom: 10 }}>
        👥 In this world ({rows.length}){' '}
        <span style={{ fontSize: 10, color: status === 'online' ? '#8affc1' : '#ffd24d' }}>
          {status}
        </span>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            fontSize: 12.5,
            padding: '4px 0',
            color: r.isMe ? '#8affc1' : '#d5e2ee',
          }}
        >
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: r.color,
                marginRight: 7,
              }}
            />
            {r.name}
            {r.isMe && <span style={{ color: '#8a94a5' }}> (you)</span>}
          </span>
          <span>⭐ {r.score}</span>
        </div>
      ))}
      <div style={{ fontSize: 10, color: '#8a94a5', marginTop: 10 }}>Press P to close</div>
    </div>
  );
}

// ── Emote bar ─────────────────────────────────────────────────────────────

export function EmoteBar({ touchMode }: { touchMode: boolean }) {
  const [flash, setFlash] = useState<EmoteName | null>(null);

  const fire = (name: EmoteName) => {
    sendEmote(name);
    setFlash(name);
    setTimeout(() => setFlash((f) => (f === name ? null : f)), 600);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: touchMode ? 210 : 20,
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 6,
        zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        padding: '6px 8px',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.15)',
      }}
    >
      {EMOTES.map((e) => (
        <button
          key={e.name}
          type="button"
          title={`${e.label} (${e.key})`}
          aria-label={e.label}
          onPointerDown={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            fire(e.name);
          }}
          style={{
            width: 42,
            height: 42,
            borderRadius: 8,
            border: flash === e.name ? '2px solid #8affc1' : '2px solid rgba(255,255,255,0.22)',
            background: flash === e.name ? 'rgba(138,255,193,0.18)' : 'rgba(255,255,255,0.06)',
            cursor: 'pointer',
            fontSize: 19,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'none',
            fontFamily: mono,
          }}
        >
          <span>{e.icon}</span>
          {!touchMode && <span style={{ fontSize: 8, color: '#9fb0c0' }}>{e.key}</span>}
        </button>
      ))}
    </div>
  );
}
