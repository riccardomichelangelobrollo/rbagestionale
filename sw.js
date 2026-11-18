/* Serve solo a rendere il gestionale installabile come app.
   Non conserva copie delle pagine: ogni volta si scarica la versione aggiornata,
   così le modifiche pubblicate si vedono subito. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
