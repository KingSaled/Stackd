import { SpeakerLowIcon, SpeakerHighIcon, SpeakerXIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store/settings';
import { sound } from '../lib/sound';

/** Global mute toggle with a volume slider popover. */
export function SoundControl() {
  const { volume, muted, set, toggleMute } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  const Icon = muted || volume === 0 ? SpeakerXIcon : volume < 0.5 ? SpeakerLowIcon : SpeakerHighIcon;
  return (
    <div className="sound-control" ref={ref}>
      <button
        className="icon-btn"
        aria-label={muted ? 'Unmute' : 'Sound settings'}
        onClick={() => setOpen((o) => !o)}
        onDoubleClick={toggleMute}
      >
        <Icon size={18} />
      </button>
      {open && (
        <div className="popover sound-control__pop">
          <button className="btn btn--ghost btn--sm" onClick={toggleMute}>
            {muted ? <SpeakerXIcon size={16} /> : <SpeakerHighIcon size={16} />} {muted ? 'Unmute' : 'Mute'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={(e) => set({ volume: Number(e.target.value), muted: false })}
            onPointerUp={() => sound.play('chip')}
          />
        </div>
      )}
    </div>
  );
}
