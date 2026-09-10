import { MISSIONS, formatClock, type MissionId } from '../game/missions';

export interface LevelBox {
  id: MissionId;
  n: number;
  title: string;
  blurb: string;
  timeLimit: number;
  status: 'locked' | 'open' | 'done' | 'active';
}

export function LevelSelect({
  items,
  subtitle,
  onPick,
  onClose,
}: {
  items: LevelBox[];
  subtitle?: string;
  onPick: (id: MissionId) => void;
  onClose?: () => void;
}) {
  const done = items.filter((i) => i.status === 'done').length;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 10, 16, 0.82)',
        zIndex: 270,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'monospace',
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        style={{
          background: '#12161f',
          border: '2px solid rgba(255,255,255,0.14)',
          borderRadius: 16,
          padding: '18px 16px 16px',
          width: 'min(420px, 96vw)',
          maxHeight: '88vh',
          overflowY: 'auto',
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ffd76a' }}>Levels</div>
          <div style={{ fontSize: 12, color: '#8a94a5' }}>{done}/25</div>
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: '#b8c4d0', marginBottom: 12, lineHeight: 1.45 }}>{subtitle}</div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
          }}
        >
          {items.map((lv) => {
            const locked = lv.status === 'locked';
            const doneBox = lv.status === 'done';
            const active = lv.status === 'active';
            return (
              <button
                key={lv.id}
                type="button"
                disabled={locked}
                title={locked ? `Clear level ${lv.n - 1} first` : `${lv.n}. ${lv.title} · ${formatClock(lv.timeLimit)}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!locked) onPick(lv.id);
                }}
                style={{
                  aspectRatio: '1',
                  borderRadius: 10,
                  border: active
                    ? '2px solid #7CFC00'
                    : doneBox
                      ? '2px solid #2e8b57'
                      : locked
                        ? '2px solid rgba(255,255,255,0.08)'
                        : '2px solid rgba(255,215,106,0.45)',
                  background: locked
                    ? 'rgba(255,255,255,0.04)'
                    : doneBox
                      ? 'rgba(46,139,87,0.28)'
                      : active
                        ? 'rgba(124,252,0,0.18)'
                        : 'rgba(255,215,106,0.12)',
                  color: locked ? '#555' : '#fff',
                  fontSize: 18,
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  touchAction: 'none',
                }}
              >
                {lv.n}
              </button>
            );
          })}
        </div>
        <LevelPreview items={items} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              marginTop: 12,
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              color: '#ccc',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 8,
              padding: '10px 12px',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

function LevelPreview({ items }: { items: LevelBox[] }) {
  const focus = items.find((i) => i.status === 'active') ?? items.find((i) => i.status === 'open');
  if (!focus) return null;
  const def = MISSIONS.find((m) => m.id === focus.id);
  if (!def) return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 12,
        lineHeight: 1.45,
        color: '#c8d4e0',
      }}
    >
      <div style={{ color: '#ffd76a', fontWeight: 'bold', marginBottom: 4 }}>
        {def.n}. {def.title} · {formatClock(def.timeLimit)}
      </div>
      <div>{def.blurb}</div>
      <div style={{ color: '#8affc1', marginTop: 4 }}>{def.hint}</div>
    </div>
  );
}
