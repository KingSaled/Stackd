import { AnimatePresence, motion } from 'framer-motion';
import { WarningIcon, CheckCircleIcon, InfoIcon, TrophyIcon } from '@phosphor-icons/react';
import { useToasts } from '../store/toast';

const ICONS = { info: InfoIcon, success: CheckCircleIcon, error: WarningIcon, win: TrophyIcon };

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
