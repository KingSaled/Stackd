import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import './styles/base.css';
import './styles/components.css';
import './styles/table.css';
import './styles/pages.css';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);

if (import.meta.env.DEV && window.location.pathname.startsWith('/dev')) {
  // Local UI playground (never included in production builds).
  void import('./dev/Playground').then(({ default: Playground }) =>
    root.render(
      <StrictMode>
        <Playground />
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
