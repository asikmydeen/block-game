import { useEffect } from 'react';

export interface LootItem {
  name: string;
  qty: number;
  color: string;
}

const LOOT_POOL: Array<{ name: string; color: string; minQty: number; maxQty: number }> = [
  { name: 'Gold Coins',    color: '#FFD700', minQty: 5,  maxQty: 50 },
  { name: 'Iron Ingots',   color: '#B0B8C0', minQty: 1,  maxQty: 8  },
  { name: 'Bread Loaf',    color: '#C8A060', minQty: 1,  maxQty: 4  },
  { name: 'Torch',         color: '#FF8C00', minQty: 1,  maxQty: 6  },
  { name: 'Old Key',       color: '#8B7355', minQty: 1,  maxQty: 1  },
  { name: 'Emerald',       color: '#50C878', minQty: 1,  maxQty: 3  },
  { name: 'Arrows',        color: '#6B4226', minQty: 3,  maxQty: 12 },
  { name: 'Health Flask',  color: '#E03030', minQty: 1,  maxQty: 2  },
  { name: 'Rope',          color: '#A0896A', minQty: 1,  maxQty: 3  },
  { name: 'Ancient Map',   color: '#D4C090', minQty: 1,  maxQty: 1  },
  { name: 'Coal',          color: '#333333', minQty: 2,  maxQty: 10 },
  { name: 'Steel Sword',   color: '#C0C8D0', minQty: 1,  maxQty: 1  },
];

export function generateLoot(lucky = false): LootItem[] {
  const pool = [...LOOT_POOL].sort(() => Math.random() - 0.5);
  const count = (lucky ? 7 : 4) + Math.floor(Math.random() * 3);
  return pool.slice(0, count).map(entry => ({
    name: entry.name,
    color: entry.color,
    qty: (entry.minQty + Math.floor(Math.random() * (entry.maxQty - entry.minQty + 1))) * (lucky ? 2 : 1),
  }));
}

interface ChestUIProps {
  loot: LootItem[];
  onClose: () => void;
}

export function ChestUI({ loot, onClose }: ChestUIProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1c1008',
          border: '3px solid #8B6914',
          borderRadius: 10,
          padding: '20px 24px',
          minWidth: 340,
          maxWidth: 420,
          boxShadow: '0 0 32px rgba(139,105,20,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ color: '#D4AF37', fontSize: 18, fontWeight: 'bold', letterSpacing: 2 }}>
            CHEST
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #555',
              color: '#aaa',
              cursor: 'pointer',
              fontSize: 14,
              borderRadius: 4,
              padding: '2px 8px',
              fontFamily: 'monospace',
            }}
          >
            close
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}
        >
          {loot.map((item, i) => (
            <div
              key={i}
              style={{
                background: '#0e0804',
                border: '2px solid #5C3D1A',
                borderRadius: 6,
                padding: '10px 6px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: item.color,
                  margin: '0 auto 8px',
                  borderRadius: 5,
                  boxShadow: `0 0 8px ${item.color}88`,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              />
              <div style={{ color: '#FFD700', fontSize: 10, marginBottom: 3, lineHeight: 1.3 }}>
                {item.name}
              </div>
              <div style={{ color: '#888', fontSize: 11, fontWeight: 'bold' }}>
                x{item.qty}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, color: '#555', fontSize: 10, textAlign: 'center' }}>
          Press E or Escape to close
        </div>
      </div>
    </div>
  );
}

interface ToastProps {
  message: string;
}

export function Toast({ message }: ToastProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 130,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(10,10,10,0.88)',
        color: '#fff',
        padding: '10px 22px',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 14,
        zIndex: 200,
        border: '1px solid #444',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}
