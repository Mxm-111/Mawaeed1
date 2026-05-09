// sw.js - Service Worker for مواعيدي
// Enables background alarm checking even when app is closed

const CACHE_NAME = 'maweid-v4';
const ASSETS = ['/', '/index.html'];

// ===== INSTALL =====
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

// ===== ACTIVATE =====
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ===== FETCH (cache-first) =====
self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request))
    );
});

// ===== ALARM STATE =====
let alarms = [];
let checkTimer = null;

// ===== RECEIVE ALARMS FROM APP =====
self.addEventListener('message', e => {
    if (e.data && e.data.type === 'SYNC_ALARMS') {
        alarms = e.data.alarms || [];
        scheduleCheck();
    }
});

function scheduleCheck() {
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(checkAlarms, 30000);
    checkAlarms(); // immediate
}

const notifiedIds = new Set();

function checkAlarms() {
    const now = Date.now();
    alarms.forEach(alarm => {
        const target = new Date(`${alarm.date}T${alarm.time}:00`).getTime();
        const diff = target - now;
        const key = alarm.id + '-fired';

        // Fire when within 30 seconds of alarm time
        if (diff >= -30000 && diff <= 30000 && !notifiedIds.has(key)) {
            notifiedIds.add(key);

            // Show push notification
            self.registration.showNotification('⏰ ' + alarm.title, {
                body: `موعدك الآن: ${alarm.date} · ${alarm.time}`,
                icon: 'icon-192.png',
                badge: 'icon-192.png',
                vibrate: [400, 200, 400, 200, 400],
                tag: alarm.id,
                requireInteraction: true,
                actions: [
                    { action: 'dismiss', title: 'إيقاف' },
                    { action: 'snooze',  title: '💤 تأجيل' }
                ],
                data: { alarmId: alarm.id, title: alarm.title }
            }).catch(() => {});

            // Also notify app if it's open
            self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
                clients.forEach(client => client.postMessage({ type: 'ALARM_TRIGGER', id: alarm.id }));
            });
        }
    });
}

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', e => {
    e.notification.close();
    if (e.action === 'snooze') {
        // Could implement snooze via message back to app
    }
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            if (clients.length > 0) {
                clients[0].focus();
            } else {
                self.clients.openWindow('/');
            }
        })
    );
});

// ===== BACKGROUND SYNC (for scheduled checks) =====
self.addEventListener('periodicsync', e => {
    if (e.tag === 'alarm-check') {
        e.waitUntil(checkAlarms());
    }
});
