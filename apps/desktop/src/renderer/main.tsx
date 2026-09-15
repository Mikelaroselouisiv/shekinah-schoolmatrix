import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { getAppEdition } from './config/edition';
import { initApi } from './services/api';
import { patchNativeDialogs } from './lib/patchNativeDialogs';

patchNativeDialogs();

function Bootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    initApi()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Connexion au serveur impossible');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8 text-slate-700">
        <p>{error}</p>
      </div>
    );
  }

  if (!ready) {
    const edition = getAppEdition();
    const message =
      edition === 'remote'
        ? 'Recherche du serveur cloud…'
        : 'Connexion au serveur local…';
    return (
      <div className="flex items-center justify-center min-h-screen p-8 text-slate-500">
        {message}
      </div>
    );
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
