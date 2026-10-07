import { Avatar } from '../components/Avatar';
import { BACKDROPS, FRAMES } from '../../shared/cosmetics';

/** Dev-only: every border and background at large and small sizes (/dev/cosmetics). */
export default function CosmeticsGallery() {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('kind') ?? 'frame';
  const size = Number(params.get('size') ?? 150);
  const items = kind === 'frame' ? FRAMES : BACKDROPS;
  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: `repeat(5, ${size + 40}px)`, gap: 18, background: '#0b0f1c', minHeight: '100vh' }}>
      {items.map((it) => (
        <div key={it.id} style={{ display: 'grid', justifyItems: 'center', gap: 10, color: '#cfd6e6', font: '600 12px Inter, sans-serif' }}>
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
