import { Component, type ReactNode } from 'react';
import { Logo } from './Logo';

/**
 * Last line of defence: if anything throws while rendering, show a way back instead of a blank page.
 * A route change (or the button) clears the error and tries again.
 */
export class CrashGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Render error', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page page--center splash">
        <Logo size="lg" />
        <p className="muted">Something went wrong loading this screen.</p>
        <button type="button" className="btn btn--gold" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
