import { Logo } from '../components/Logo';

/** Shown when the deployment has no Supabase configuration yet. */
export function SetupPage() {
  return (
    <div className="page page--center">
      <div className="card setup">
        <Logo size="lg" />
        <h1>Almost ready to deal</h1>
        <p className="muted">
          Stackd is deployed, but it isn't connected to its database yet. The site owner needs to finish a two-minute setup:
        </p>
        <ol className="setup__steps">
          <li>
            Create a free project at <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.
          </li>
          <li>
            In the Supabase <strong>SQL editor</strong>, run the contents of <code>supabase/schema.sql</code> from the repository.
          </li>
          <li>
            In Netlify → <strong>Site configuration → Environment variables</strong>, add <code>SUPABASE_URL</code>,{' '}
            <code>SUPABASE_ANON_KEY</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> (from Supabase → Project Settings → API).
          </li>
          <li>Trigger a new deploy in Netlify. That's it — share your link and play!</li>
        </ol>
        <p className="muted small">Full instructions are in the README.</p>
      </div>
    </div>
  );
}
