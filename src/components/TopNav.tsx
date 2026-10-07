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
import { chips, chipsShort } from '../lib/format';

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
        {profile && <GameSwitch />}
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
