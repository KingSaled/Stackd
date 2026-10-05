import { useLayoutEffect, useState, type RefObject } from 'react';

export interface StageMetrics {
  w: number;
  h: number;
  portrait: boolean;
  aspect: number;
}

/** Fit the largest table stage of a sensible aspect ratio into the container. */
export function useStage(ref: RefObject<HTMLElement | null>): StageMetrics {
  const [m, setM] = useState<StageMetrics>({ w: 0, h: 0, portrait: false, aspect: 1.8 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const portrait = cw / ch < 1.05;
      const aspect = portrait ? Math.max(0.56, Math.min(0.82, cw / ch)) : Math.max(1.45, Math.min(2.05, cw / ch));
      let w = cw;
      let h = cw / aspect;
      if (h > ch) {
        h = ch;
        w = ch * aspect;
      }
      setM((prev) =>
        Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 && prev.portrait === portrait
          ? prev
          : { w, h, portrait, aspect },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return m;
}
