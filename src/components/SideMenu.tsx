import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import clsx from 'clsx';
import { ListIcon, StorefrontIcon, UserCircleIcon, XIcon } from '@phosphor-icons/react';
import { Logo } from './Logo';
import { MiniCards } from './GameSwitch';
import { MinigameArt } from './minigames/MinigameArt';
import { MINIGAMES } from '../../shared/minigames';
import { useGameMode, type GameMode } from '../store/game';
import { sound } from '../lib/sound';
import { create } from 'zustand';

/** Whether the side menu is open (shared so any page can open it). */
export const useSideMenu = create<{ open: boolean; set(open: boolean): void }>((set) => ({ open: false, set: (open) => set({ open }) }));

/** The three-line button that opens the side menu. */
export function MenuButton() {
  const set = useSideMenu((s) => s.set);
  return (
    <button
      className="icon-btn menu-btn"
      aria-label="Open menu"
      onClick={() => {
        sound.play('click');
        set(true);
      }}
    >
      <ListIcon size={20} weight="bold" />
    </button>
  );
}

const TABLE_GAMES: { id: GameMode; name: string; tagline: string }[] = [
  { id: 'holdem', name: "Texas Hold'em", tagline: 'Poker with friends and bots' },
  { id: 'blackjack', name: 'Blackjack', tagline: 'Beat the dealer to 21' },
];

/** Slide-out menu: table games, minigames and the rest of the app. */
export function SideMenu() {
  const open = useSideMenu((s) => s.open);
  const set = useSideMenu((s) => s.set);
  const [location, navigate] = useLocation();
  const mode = useGameMode((s) => s.mode);
  const setMode = useGameMode((s) => s.setMode);
  const close = () => set(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, set]);
  // Leaving the page closes the menu.
  useEffect(() => set(false), [location, set]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="side-menu__backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.nav
            className="side-menu"
            aria-label="Menu"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="side-menu__head">
              <Logo size="sm" />
              <button className="icon-btn" onClick={close} aria-label="Close menu">
                <XIcon size={18} />
              </button>
            </div>

            <div className="side-menu__section">
              <h3>Table games</h3>
              {TABLE_GAMES.map((g) => (
                <button
                  key={g.id}
                  className={clsx('side-menu__item', location === '/' && mode === g.id && 'is-on')}
                  onClick={() => {
                    sound.play('click');
                    setMode(g.id);
                    navigate('/');
                    close();
                  }}
                >
                  <span className={clsx('side-menu__cards', `side-menu__cards--${g.id}`)}>
                    <MiniCards game={g.id} />
                  </span>
                  <span className="side-menu__text">
                    <strong>{g.name}</strong>
                    <small>{g.tagline}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="side-menu__section">
              <h3>Minigames</h3>
              {MINIGAMES.map((g) => (
                <Link key={g.id} href={g.path} className={clsx('side-menu__item', location === g.path && 'is-on')} onClick={() => sound.play('click')}>
                  <MinigameArt id={g.id} size={40} />
                  <span className="side-menu__text">
                    <strong>{g.name}</strong>
                    <small>{g.tagline}</small>
                  </span>
                </Link>
              ))}
            </div>

            <div className="side-menu__section side-menu__section--links">
              <Link href="/shop" className={clsx('side-menu__link', location === '/shop' && 'is-on')}>
                <StorefrontIcon size={18} weight="fill" /> Cosmetic Shop
              </Link>
              <Link href="/profile" className={clsx('side-menu__link', location === '/profile' && 'is-on')}>
                <UserCircleIcon size={18} weight="fill" /> Profile
              </Link>
            </div>
            <p className="side-menu__note">Play money only · 18+</p>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
