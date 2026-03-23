// Econexo Service Worker - Web Push Handler
const CACHE_NAME = 'econexo-v1';
const APP_URL = self.location.origin;

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Handle incoming push notifications
self.addEventListener('push', (event) => {
    let payload = {
        title: 'Econexo',
        body: 'Tienes una nueva notificación.',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        data: { url: '/dashboard' },
        tag: 'econexo-notification',
    };

    try {
        if (event.data) {
            const data = event.data.json();
            payload = {
                title: data.title || payload.title,
                body: data.body || payload.body,
                icon: '/icon-192x192.png',
                badge: '/icon-192x192.png',
                data: { url: data.url || '/dashboard', ...data.data },
                tag: data.tag || 'econexo-notification',
                vibrate: [200, 100, 200],
                requireInteraction: false,
            };
        }
    } catch (e) {
        // If JSON parse fails, use text
        if (event.data) {
            payload.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: payload.icon,
            badge: payload.badge,
            data: payload.data,
            tag: payload.tag,
            vibrate: payload.vibrate || [200, 100, 200],
            requireInteraction: payload.requireInteraction || false,
        })
    );
});

// Handle notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url)
        ? APP_URL + event.notification.data.url
        : APP_URL + '/dashboard';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Focus existing window if available
            for (const client of windowClients) {
                if (client.url.startsWith(APP_URL) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Otherwise open new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
