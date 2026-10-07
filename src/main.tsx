import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import './styles/base.css';
import './styles/components.css';
import './styles/cosmetics.css';
import './styles/table.css';
import './styles/pages.css';
import { IconContext } from '@phosphor-icons/react';
import { App } from './App';

/** Phosphor icons app-wide: bold reads crisply at small sizes on the dark UI. */
const icons = { weight: 'bold' as const, mirrored: false };

const root = createRoot(document.getElementById('root')!);

if (import.meta.env.DEV && window.location.pathname.startsWith('/dev/cosmetics')) {
  void import('./dev/CosmeticsGallery').then(({ default: Gallery }) => root.render(<Gallery />));
} else if (import.meta.env.DEV && window.location.pathname.startsWith('/dev')) {
  // Local UI playground (never included in production builds).
  void import('./dev/Playground').then(({ default: Playground }) =>
    root.render(
      <StrictMode>
        <IconContext.Provider value={icons}>
          <Playground />
        </IconContext.Provider>
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <StrictMode>
      <IconContext.Provider value={icons}>
        <App />
      </IconContext.Provider>
    </StrictMode>,
  );
}
