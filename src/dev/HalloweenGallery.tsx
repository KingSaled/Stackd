/** Dev-only preview of the Halloween artwork (/dev/halloween). */
import { Bat, Ghost, HauntedSkyline, JackOLantern, Leaf, WitchHat } from '../components/season/HalloweenArt';

export default function HalloweenGallery() {
  return (
    <div style={{ padding: 24, display: 'grid', gap: 24, background: '#120a1f', minHeight: '100vh' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'end', flexWrap: 'wrap' }}>
        <JackOLantern className="g-big" />
        <div style={{ width: 60 }}>
          <JackOLantern />
        </div>
        <div style={{ width: 160, fill: '#05020a' }}>
          <Bat />
        </div>
        <div style={{ width: 40, fill: '#05020a' }}>
          <Bat />
        </div>
        <div style={{ width: 90 }}>
          <Ghost />
        </div>
        <div style={{ width: 120 }}>
          <WitchHat />
        </div>
        {['#ff8a1c', '#d9480f', '#b5651d', '#ffb347'].map((c) => (
          <div key={c} style={{ width: 40 }}>
            <Leaf color={c} />
          </div>
        ))}
      </div>
      <div style={{ height: 200, background: 'linear-gradient(#2a1650, #120a1f)' }}>
        <HauntedSkyline />
      </div>
      <style>{'.g-big{width:260px} svg{display:block;width:100%;height:auto}'}</style>
    </div>
  );
}
