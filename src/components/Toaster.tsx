import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Trophy } from 'lucide-react';
import { useToasts } from '../store/toast';

const ICONS = { info: Info, success: CheckCircle2, error: AlertTriangle, win: Trophy };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toaster" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.button
              layout
              key={t.id}
              className={`toast toast--${t.kind}`}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              onClick={() => dismiss(t.id)}
            >
              <Icon size={16} />
              <span>{t.text}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
