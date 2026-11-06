// Unregister any lingering Service Worker on localhost
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  self.registration.unregister().then(() => {
    return self.clients.matchAll();
  }).then((clients) => {
    clients.forEach((client) => {
      if (client.url && 'navigate' in client) {
        client.navigate(client.url);
      }
    });
  });
});
