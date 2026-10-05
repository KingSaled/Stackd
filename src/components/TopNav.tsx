import { Link } from 'wouter';
import { Coins, Gift } from 'lucide-react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { SoundControl } from './SoundControl';
import { useAuth } from '../store/auth';
import { useEconomy } from '../hooks/useEconomy';
import { chips } from '../lib/format';

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 90, damping: 20 });
  const text = useTransform(spring, (v) => chips(v));
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <motion.span>{text}</motion.span>;
}

export function TopNav() {
  const profile = useAuth((s) => s.profile);
  const econ = useEconomy();
  return (
    <header className="topnav">
      <Link href="/" className="topnav__brand" aria-label="Stackd lobby">
        <Logo size="sm" />
      </Link>
      <div className="topnav__right">
        {econ.dailyReady && (
          <button className="btn btn--gold btn--sm pulse" onClick={econ.claimDaily} disabled={econ.busy}>
            <Gift size={15} /> <span className="hide-sm">Daily bonus</span>
          </button>
        )}
        <div className="wallet-pill" title="Your chips">
          <Coins size={15} />
          <AnimatedNumber value={profile?.chips ?? 0} />
        </div>
        <SoundControl />
        {profile && (
          <Link href="/profile" className="topnav__me" aria-label="Your profile">
            <Avatar emoji={profile.avatar} color={profile.color} size={34} />
          </Link>
        )}
      </div>
    </header>
  );
}
