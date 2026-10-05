import { Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../store/settings';

export function TableSettings() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { fourColor, showHandStrength, set } = useSettings();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div className="sound-control" ref={ref}>
      <button className="icon-btn" aria-label="Table settings" onClick={() => setOpen((o) => !o)}>
        <Settings2 size={18} />
      </button>
      {open && (
        <div className="popover settings-pop">
          <label className="switch">
            <input type="checkbox" checked={fourColor} onChange={(e) => set({ fourColor: e.target.checked })} />
            <span className="switch__track" />
            Four-color deck
          </label>
          <label className="switch">
            <input type="checkbox" checked={showHandStrength} onChange={(e) => set({ showHandStrength: e.target.checked })} />
            <span className="switch__track" />
            Show my hand strength
          </label>
          <p className="muted small">Shortcuts: F fold · C check/call · R raise · Enter confirm</p>
        </div>
      )}
    </div>
  );
}
