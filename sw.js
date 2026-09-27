'use strict';

// Cache-first con precache pressoché totale: qui (a differenza di /mnt/dev/pizza)
// non ci sono pagine dinamiche lato server, tutto è statico e versionato dal deploy,
// quindi ha senso cachare tutto per un vero funzionamento offline. Bump manuale della
// VERSIONE a ogni release che cambia file precachati.
const VERSIONE = 'v9';
const CACHE_NAME = 'pizzaiolo-' + VERSIONE;

// Aggiornare questa lista a ogni stadio che aggiunge pagine/asset (Stadio 1: solo il
// calcolatore; le altre pagine .html si aggiungono dagli Stadi successivi).
const PRECACHE = [
  './',
  'index.html',
  'backup.html',
  'sessione.html',
  'farine.html',
  'diario.html',
  'esperimento.html',
  'confronta.html',
  'manifest.json',
  'data/farine-catalogo.json',
  'assets/cartoon.css',
  'assets/scena.js',
  'assets/calcolo.js',
  'assets/app.js',
  'js/db.js',
  'js/backup.js',
  'js/repo.js',
  'js/pagina-impasto.js',
  'js/pagina-sessione.js',
  'js/pagina-farine.js',
  'js/pagina-diario.js',
  'js/pagina-esperimento.js',
  'js/pagina-confronta.js',
  'assets/svg/panetto.svg',
  'assets/svg/koda.svg',
  'assets/svg/termometro.svg',
  'assets/svg/lievito.svg',
  'assets/svg/lievito-secco.svg',
  'assets/svg/caraffa.svg',
  'assets/svg/nuvola.svg',
  'assets/svg/logo.svg',
  'assets/svg/nav-impasto.svg',
  'assets/svg/nav-sessione.svg',
  'assets/svg/nav-diario.svg',
  'assets/svg/nav-farine.svg',
  'assets/svg/tappa-impasto.svg',
  'assets/svg/tappa-puntata.svg',
  'assets/svg/tappa-frigo_dentro.svg',
  'assets/svg/tappa-staglio.svg',
  'assets/svg/tappa-koda.svg',
  'assets/svg/tappa-infornata.svg',
  'assets/svg/pizza.svg',
  'assets/svg/foto.svg',
  'assets/svg/vuoto-diario.svg',
  'icon-192.png',
  'icon-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)));
  // Niente self.skipWaiting() qui: un SW nuovo resta in waiting finché l'utente non
  // conferma l'aggiornamento (vedi messaggio 'skipWaiting' più sotto), per non
  // disallineare JS nuovo e pagina vecchia a metà di una sessione guidata.
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (ev) => {
  if (ev.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  ev.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        if (req.mode === 'navigate') return caches.match('index.html');
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
