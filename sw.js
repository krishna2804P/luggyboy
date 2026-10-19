// Basic Service Worker to trick the browser into showing the "Install App" prompt
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Installed');
});

self.addEventListener('fetch', (e) => {
  // Pass through all requests normally
  e.respondWith(fetch(e.request));
});
