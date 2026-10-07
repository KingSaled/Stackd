import { Link } from 'wouter';
import clsx from 'clsx';
import { MIN_AGE } from '../legal';

/** Play-money and age notice with links to the Terms and Privacy Policy. */
export function LegalFooter({ className }: { className?: string }) {
  return (
    <footer className={clsx('legal-footer', className)}>
      <span className="legal-footer__badge">{MIN_AGE}+</span>
      <span>Play money only. Chips have no cash value and can't be bought or cashed out.</span>
      <span className="legal-footer__links">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </span>
    </footer>
  );
}
