import { Link } from 'wouter';
import clsx from 'clsx';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { Logo } from '../components/Logo';
import { LegalFooter } from '../components/LegalFooter';
import { useAuth } from '../store/auth';
import { CONTACT_EMAIL, LEGAL_UPDATED, MIN_AGE } from '../legal';
import { chips } from '../lib/format';
import { ECONOMY } from '../../shared/economy';

function Contact() {
  return CONTACT_EMAIL ? (
    <>
      email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </>
  ) : (
    <>contact the operator of this site</>
  );
}

function Terms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal__meta">Last updated {LEGAL_UPDATED}</p>

      <div className="legal__callout">
        <strong>The short version:</strong> Stackd is a free poker game for adults ({MIN_AGE}+) played with virtual chips that
        have no cash value. You can't buy chips, and you can't cash them out. Play fair, be decent in chat, and have fun.
      </div>

      <h2>1. Agreeing to these Terms</h2>
      <p>
        Stackd ("Stackd", "we", "us") is an online Texas Hold'em game played with virtual, play-money chips. By creating an
        account, playing as a guest or otherwise using Stackd, you agree to these Terms of Service and to our{' '}
        <Link href="/privacy">Privacy Policy</Link>. If you don't agree, please don't use Stackd.
      </p>

      <h2>2. You must be {MIN_AGE} or older</h2>
      <p>
        Stackd is only for people who are at least {MIN_AGE} years old, or the age of majority where they live if that is
        higher. By using Stackd you confirm that you meet this requirement and that playing a social poker game with virtual
        chips is allowed where you live. We may close any account we reasonably believe belongs to someone who is too young.
      </p>

      <h2>3. Play money only: no real-money gambling</h2>
      <ul>
        <li>
          Chips are virtual game items with <strong>no monetary value</strong>. They are not money, currency or property, and
          you have no ownership rights in them.
        </li>
        <li>
          Chips <strong>cannot be bought</strong> with real money and <strong>cannot be cashed out</strong>, sold, redeemed or
          exchanged for money, prizes or anything else of value, on Stackd or anywhere else.
        </li>
        <li>No real-money wagering takes place on Stackd, and nothing you win in the game has real-world value.</li>
        <li>
          Items in the Cosmetic Shop are bought only with play chips. They are purely cosmetic and have no real-world value.
        </li>
        <li>Selling or trading chips, items or accounts for real money or anything of value is not allowed.</li>
        <li>Doing well at Stackd does not mean you would do well at real-money gambling.</li>
      </ul>
      <p>
        New accounts start with {chips(ECONOMY.startingChips)} chips, and free chips are available through the daily bonus and
        the emergency reload. If gambling of any kind stops being fun for you, free and confidential help is available, for
        example from the National Problem Gambling Helpline at 1-800-GAMBLER in the United States or a local support service
        where you live.
      </p>

      <h2>4. Your account</h2>
      <ul>
        <li>
          Guest accounts live in your browser. If you clear your browser data or sign out without saving the account with an
          email and password, it can't be recovered.
        </li>
        <li>Keep your password private. You're responsible for what happens on your account.</li>
        <li>Your display name must not impersonate anyone or be offensive.</li>
        <li>
          Don't create extra accounts to collect bonuses or to move chips between accounts. Bonuses are limited per device to
          prevent this.
        </li>
      </ul>

      <h2>5. Fair play and conduct</h2>
      <p>Cards are dealt by our servers using a cryptographically secure random number generator. You agree not to:</p>
      <ul>
        <li>collude with other players, for example by sharing hole cards or coordinating play at the same table;</li>
        <li>deliberately lose chips to another player or account ("chip dumping");</li>
        <li>use bots, scripts or other automation to play for you;</li>
        <li>exploit bugs, or try to access other accounts, our servers or our database;</li>
        <li>harass, threaten or abuse other players, or post hateful, sexual, illegal or spam content in chat or names;</li>
        <li>share other people's personal information.</li>
      </ul>
      <p>
        We use automated checks to protect fair play, such as limits on bonuses per device and reviews of unusual amounts of
        chips moving between players.
      </p>

      <h2>6. What we can do to enforce these Terms</h2>
      <p>
        If we believe these Terms have been broken, or to fix mistakes and bugs, we may, without notice: remove chips, items or
        achievements; reset balances; hide accounts from the leaderboard; remove chat messages; or suspend or delete accounts.
        Because chips and items have no monetary value, no refund or compensation is owed.
      </p>

      <h2>7. Changes to the game</h2>
      <p>
        Stackd is provided free of charge. We may change, add or remove features, adjust the game economy (including bonus
        amounts and shop prices), reset leaderboards or balances, or stop running Stackd at any time.
      </p>

      <h2>8. Chat and names</h2>
      <p>
        Chat messages and display names you post stay yours, but you give us permission to store and show them to other
        players so the game can work. Chat is visible to everyone at the table, so please don't share personal information.
      </p>

      <h2>9. No warranties</h2>
      <p>
        Stackd is provided "as is" and "as available", without warranties of any kind, express or implied, including
        warranties of merchantability, fitness for a particular purpose and non-infringement. We don't promise that Stackd will
        be available, uninterrupted, secure or error-free, or that your data, chips or items will be preserved.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, we are not liable for any indirect, incidental, special, consequential or
        punitive damages, or for any loss of data, chips, items, profits or goodwill, arising from your use of Stackd. Our total
        liability for any claim relating to Stackd is limited to USD $10. Some places don't allow these limits, in which case
        they apply only as far as the law permits.
      </p>

      <h2>11. Indemnity</h2>
      <p>
        You agree to cover any claims, losses or costs (including reasonable legal fees) that arise from your breach of these
        Terms or your misuse of Stackd.
      </p>

      <h2>12. Ending your use</h2>
      <p>
        You can stop playing at any time and permanently delete your account from your Profile. We may suspend or end your
        access as described above. Sections that by their nature should continue (such as 3, 9, 10 and 11) still apply
        afterwards.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms. When we make a change you need to agree to, we'll ask you to accept the new version on your
        next visit. The date at the top shows when they last changed.
      </p>

      <h2>14. Governing law</h2>
      <p>
        These Terms are governed by the laws of the place where the operator of Stackd is established, without regard to
        conflict-of-law rules, except where the law of the place you live requires otherwise.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms? <Contact />.
      </p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal__meta">Last updated {LEGAL_UPDATED}</p>

      <div className="legal__callout">
        <strong>The short version:</strong> we keep what the game needs to work and to stay fair. No ads, no tracking
        cookies, no selling your data. You can delete your account and its data at any time from your Profile.
      </div>

      <h2>1. Who this covers</h2>
      <p>
        This policy explains what information Stackd ("we", "us") collects when you play, how we use it and the choices you
        have. Stackd is only for people aged {MIN_AGE} and over.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address (if you create an account or save a guest account), your
          display name, portrait, colour and equipped cosmetic items. Passwords are handled by our authentication provider and
          stored only as secure hashes; we never see them.
        </li>
        <li>
          <strong>Game data:</strong> your chip balance, the tables you join and your actions in hands, statistics,
          achievements, Cosmetic Shop purchases, bonus claims, and the chat messages and reactions you send.
        </li>
        <li>
          <strong>Agreement records:</strong> when you accepted these policies, which version, and your confirmation that you
          are {MIN_AGE} or older.
        </li>
        <li>
          <strong>Fair-play data:</strong> a random identifier created by your browser for Stackd and your IP address. We
          store these only as salted one-way hashes (scrambled values that can't be turned back into the original), and use
          them only to limit bonuses per device and to spot linked accounts. We also keep records of chips moving between
          players and any automated cheating flags.
        </li>
        <li>
          <strong>Technical data:</strong> our hosting providers process standard request information such as IP addresses
          and logs to deliver and secure the service.
        </li>
        <li>
          <strong>On your device:</strong> Stackd uses your browser's local storage to keep you signed in and to remember your
          settings (like sound and volume), which updates you've seen and the device identifier above. We don't use
          advertising or tracking cookies, and there are no third-party analytics or ads.
        </li>
      </ul>

      <h2>3. How we use it</h2>
      <ul>
        <li>to run the game: sign-in, tables, chips, stats, achievements and the leaderboard;</li>
        <li>to keep the game fair and secure, including detecting cheating, collusion and bonus abuse;</li>
        <li>to send sign-in, email confirmation and password-reset emails you ask for;</li>
        <li>to meet legal obligations and enforce our Terms.</li>
      </ul>
      <p>
        If you're in the EEA or UK, we rely on performing our agreement with you (running the game you signed up for) and our
        legitimate interests in keeping Stackd fair and secure.
      </p>

      <h2>4. What other players can see</h2>
      <p>
        Your display name, portrait, colour, cosmetic items, chips at the table, stats, achievements, chat messages and (for
        saved accounts) your place on the leaderboard. Your email address is never shown to other players. Guest accounts are
        not ranked on the leaderboard.
      </p>

      <h2>5. Who we share it with</h2>
      <p>
        We use <strong>Supabase</strong> for our database and sign-in, and <strong>Netlify</strong> to host the site and run
        our game servers. They process data on our behalf and may store it in the United States or other countries. We don't
        sell your personal information or share it for advertising. We may disclose information if the law requires it or to
        protect players and the service.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        We keep your account data for as long as your account exists. Table chat is deleted automatically after about three
        days, and empty tables are removed. When you delete your account, your profile, chips, stats, achievements, items,
        chat and fair-play records are deleted with it; copies in our providers' backups expire on their normal schedule.
      </p>

      <h2>7. Your choices and rights</h2>
      <ul>
        <li>You can change your name and look at any time on your Profile.</li>
        <li>
          You can permanently delete your account and its data from <strong>Profile → Delete account</strong>.
        </li>
        <li>
          Depending on where you live (for example under the GDPR, UK GDPR or California's CCPA), you may have rights to
          access, correct, delete or receive a copy of your data, and to object to or restrict how we use it. To make a
          request, <Contact />. You can also complain to your local data protection authority.
        </li>
      </ul>

      <h2>8. Age limit</h2>
      <p>
        Stackd is not for anyone under {MIN_AGE}. We don't knowingly collect information from anyone under {MIN_AGE}, and we
        delete such accounts when we learn about them.
      </p>

      <h2>9. Security</h2>
      <p>
        Connections are encrypted (HTTPS), database access is restricted per player, passwords are hashed by our sign-in
        provider, and fair-play identifiers are stored only as hashes. No system is perfectly secure, so please use a unique
        password.
      </p>

      <h2>10. Changes</h2>
      <p>
        We'll update this policy when our practices change and show the date at the top. If a change needs your agreement,
        we'll ask on your next visit.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions or requests about your data? <Contact />.
      </p>
    </>
  );
}

export function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const session = useAuth((s) => s.session);
  return (
    <div className="page legal">
      <header className="legal__top">
        <Link href={session ? '/' : '/auth'} className="legal__back">
          <ArrowLeftIcon size={16} /> Back
        </Link>
        <Logo size="sm" />
        <nav className="segmented legal__tabs" aria-label="Legal documents">
          <Link href="/terms" className={clsx(doc === 'terms' && 'is-on')}>
            Terms
          </Link>
          <Link href="/privacy" className={clsx(doc === 'privacy' && 'is-on')}>
            Privacy
          </Link>
        </nav>
      </header>
      <main className="legal__doc">{doc === 'terms' ? <Terms /> : <Privacy />}</main>
      <LegalFooter />
    </div>
  );
}
