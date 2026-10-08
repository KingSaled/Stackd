import { Link, useLocation } from 'wouter';
import clsx from 'clsx';
import { CoinsIcon, GiftIcon, StorefrontIcon } from '@phosphor-icons/react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { SoundControl } from './SoundControl';
import { GameSwitch } from './GameSwitch';
import { useAuth } from '../store/auth';
import { useEconomy } from '../hooks/useEconomy';
import { chips, chipsShort, countShort } from '../lib/format';
import { useOnline } from '../store/online';
import { ChallengesButton } from './challenges/Challenges';

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 90, damping: 20 });
  const text = useTransform(spring, (v) => chips(v));
  // Narrow phones show the compact form (1.23M) so the bar never overflows.
  const short = useTransform(spring, (v) => chipsShort(v));
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return (
    <>
      <motion.span className="wallet-pill__full">{text}</motion.span>
      <motion.span className="wallet-pill__short">{short}</motion.span>
    </>
  );
}

/** Players online right now (you count, so it never shows 0 while you're here). */
function OnlinePill({ className }: { className: string }) {
  const count = Math.max(1, useOnline((s) => s.count) ?? 1);
  const label = `${count.toLocaleString('en-US')} player${count === 1 ? '' : 's'} online`;
  return (
    <span className={clsx('online-pill', className)} title={label} aria-label={label}>
      <span className="online-pill__dot" />
      <strong>{countShort(count)}</strong>
      <span className="online-pill__label">online</span>
    </span>
  );
}

export function TopNav() {
  const profile = useAuth((s) => s.profile);
  const econ = useEconomy();
  const [location] = useLocation();
  return (
    <header className="topnav">
      <div className="topnav__left">
        <Link href="/" className="topnav__brand" aria-label="Stackd lobby">
          <Logo size="sm" />
        </Link>
        {profile && (
          <div className="topnav__games">
            <GameSwitch />
            {/* Phones: the online count sits at the end of the game switch row. */}
            <ChallengesButton className="chal-pill--row" />
            <OnlinePill className="online-pill--row" />
          </div>
        )}
      </div>
      <div className="topnav__right">
        {econ.dailyReady && (
          <button className="btn btn--gold btn--sm pulse" onClick={econ.claimDaily} disabled={econ.busy}>
            <GiftIcon size={15} weight="fill" /> <span className="hide-md">Daily bonus</span>
          </button>
        )}
        <div className="wallet-pill" title="Your chips">
          <CoinsIcon size={15} weight="fill" />
          <AnimatedNumber value={profile?.chips ?? 0} />
        </div>
        <Link href="/shop" className={clsx('shop-pill', location === '/shop' && 'is-on')} aria-label="Cosmetic Shop">
          <StorefrontIcon size={16} weight="fill" />
          <span className="shop-pill__full">Cosmetic Shop</span>
          <span className="shop-pill__short">Shop</span>
        </Link>
        <ChallengesButton className="chal-pill--bar" />
        <OnlinePill className="online-pill--bar" />
        <SoundControl />
        {profile && (
          <Link href="/profile" className="topnav__me" aria-label="Your profile">
            <Avatar avatar={profile.avatar} color={profile.color} frame={profile.frame} backdrop={profile.backdrop} size={34} />
          </Link>
        )}
      </div>
    </header>
  );
}
