import { defineConfig, loadEnv, type Plugin } from 'vite';

// Unique id of this build: Netlify's commit hash when available, otherwise a timestamp.
const BUILD_ID = (process.env.COMMIT_REF || '').slice(0, 12) || `local-${Date.now()}`;

/** Emits /version.json so open tabs can tell when a newer build has been deployed. */
function versionFile(): Plugin {
  return {
    name: 'stackd-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}
import react from '@vitejs/plugin-react';

// Only the public Supabase URL and anon/publishable key are embedded in the client bundle.
// Accept the names used by the Netlify Supabase extension as well as plain names.
function pick(env: Record<string, string>, ...names: string[]) {
  for (const n of names) {
    const v = env[n] ?? process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const url = pick(env, 'VITE_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_DATABASE_URL', 'SUPABASE_DATABASE_URL');
  const key = pick(
    env,
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
  );
  return {
    plugins: [react(), versionFile()],
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      __SUPABASE_URL__: JSON.stringify(url),
      __SUPABASE_ANON_KEY__: JSON.stringify(key),
    },
    server: {
      port: 5173,
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
  };
});
