import { Avatar } from '../components/Avatar';
import { PlayerName } from '../components/flair/PlayerName';
import { ClubCard } from '../components/flair/ClubCard';
import { BACKDROPS, CLUB_CARDS, FRAMES, NAME_STYLES } from '../../shared/cosmetics';

/** Dev-only: every cosmetic at large and small sizes (/dev/cosmetics?kind=frame|backdrop|name|club&from=tier). */
export default function CosmeticsGallery() {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('kind') ?? 'frame';
  const size = Number(params.get('size') ?? 150);
  const from = Number(params.get('from') ?? 1);
  const cols = Number(params.get('cols') ?? 5);
  const page = { padding: 24, background: '#0b0f1c', minHeight: '100vh', color: '#cfd6e6', font: '600 12px Inter, sans-serif' } as const;

  if (kind === 'name') {
    const names = NAME_STYLES.filter((n) => n.tier >= from);
    return (
      <div style={{ ...page, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 14 }}>
        {names.map((n) => (
          <div key={n.id} style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 14, background: '#141b2e', border: '1px solid #232c45' }}>
            <span style={{ color: '#8a93a8', fontSize: 11 }}>
              {n.name} · T{n.tier}
            </span>
            <span style={{ font: "800 26px 'Outfit Variable', sans-serif", color: '#eef1f8' }}>
              <PlayerName name="HighRoller" fx={n.id} />
            </span>
            <span style={{ font: '700 14px Inter, sans-serif', color: '#eef1f8', background: 'rgba(0,0,0,.45)', padding: '4px 8px', borderRadius: 8, width: 'fit-content' }}>
              <PlayerName name="Maya" fx={n.id} club="club-gold" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'club') {
    return (
      <div style={{ ...page, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 340px))', gap: 22 }}>
        {CLUB_CARDS.map((c, i) => (
          <div key={c.id} style={{ display: 'grid', gap: 12 }}>
            <ClubCard id={c.id} holder="Maximilian" number={i * 3 + 1} since="2026-10-10T12:00:00Z" />
            <span style={{ font: '700 15px Inter, sans-serif', color: '#eef1f8' }}>
              <PlayerName name="Alex" club={c.id} /> <PlayerName name="Maya" fx="name-gold" club={c.id} />
            </span>
            <span style={{ font: '700 11px Inter, sans-serif', color: '#eef1f8' }}>
              <PlayerName name="Small text" club={c.id} />
            </span>
          </div>
        ))}
      </div>
    );
  }

  const items = (kind === 'frame' ? FRAMES : BACKDROPS).filter((c) => c.tier >= from);
  return (
    <div style={{ ...page, display: 'grid', gridTemplateColumns: `repeat(${cols}, ${size + 40}px)`, gap: 18 }}>
      {items.map((it) => (
        <div key={it.id} style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
          <Avatar avatar="p24" color="#f5c451" size={size} frame={kind === 'frame' ? it.id : null} backdrop={kind === 'backdrop' ? it.id : null} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Avatar avatar="p24" color="#f5c451" size={56} frame={kind === 'frame' ? it.id : null} backdrop={kind === 'backdrop' ? it.id : null} />
            <Avatar avatar="p24" color="#f5c451" size={32} frame={kind === 'frame' ? it.id : null} backdrop={kind === 'backdrop' ? it.id : null} />
          </div>
          <span>{it.name}</span>
        </div>
      ))}
    </div>
  );
}
