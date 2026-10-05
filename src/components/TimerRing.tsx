import { useEffect, useRef } from 'react';
import { serverNow } from '../lib/clock';

/**
 * Circular countdown drawn around an avatar. Animated with requestAnimationFrame
 * against the server clock so every viewer sees the same remaining time.
 */
export function TimerRing({ startedAt, deadline }: { startedAt: number; deadline: number }) {
  const ref = useRef<SVGCircleElement>(null);
  const R = 47;
  const C = 2 * Math.PI * R;
  useEffect(() => {
    let raf = 0;
    const total = Math.max(1, deadline - startedAt);
    const seatEl = ref.current?.closest('.seat') ?? null;
    const frame = () => {
      const left = Math.max(0, deadline - serverNow());
      const p = left / total;
      const el = ref.current;
      if (el) {
        el.style.strokeDashoffset = String(C * (1 - p));
        const hue = p > 0.5 ? 150 : p > 0.25 ? 45 : 355;
        el.style.stroke = `hsl(${hue} 90% 58%)`;
        seatEl?.classList.toggle('is-urgent', left < 5000);
      }
      if (left > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      seatEl?.classList.remove('is-urgent');
    };
  }, [startedAt, deadline, C]);
  return (
    <svg className="timer-ring" viewBox="0 0 100 100" aria-hidden>
      <circle className="timer-ring__track" cx="50" cy="50" r={R} />
      <circle ref={ref} className="timer-ring__bar" cx="50" cy="50" r={R} strokeDasharray={C} strokeDashoffset={0} />
    </svg>
  );
}
