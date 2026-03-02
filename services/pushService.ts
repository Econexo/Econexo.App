import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/**
 * Convert base64url string to Uint8Array for VAPID public key
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; ++i) {
        view[i] = rawData.charCodeAt(i);
    }
    return buffer;
}

/**
 * Register Service Worker and subscribe to Web Push.
 * Saves subscription to Supabase push_subscriptions table.
 */
export const subscribeToPush = async (userId: string): Promise<boolean> => {
    try {
        // Check browser support
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.log('Push notifications not supported in this browser.');
            return false;
        }

        if (!VAPID_PUBLIC_KEY) {
            console.error('VITE_VAPID_PUBLIC_KEY is not set.');
            return false;
        }

        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Notification permission denied.');
            return false;
        }

        // Get service worker registration
        const registration = await navigator.serviceWorker.ready;

        // Check if already subscribed
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // Create new subscription
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
        }

        const subJson = subscription.toJSON();

        // Save to Supabase (upsert by endpoint)
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert(
                {
                    user_id: userId,
                    endpoint: subJson.endpoint!,
                    p256dh: subJson.keys!['p256dh'],
                    auth: subJson.keys!['auth'],
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'endpoint' }
            );

        if (error) {
            console.error('Error saving push subscription:', error);
            return false;
        }

        console.log('✅ Push subscription saved successfully.');
        return true;
    } catch (err) {
        console.error('Error subscribing to push:', err);
        return false;
    }
};

/**
 * Unsubscribe from Web Push and remove from Supabase.
 */
export const unsubscribeFromPush = async (userId: string): Promise<boolean> => {
    try {
        if (!('serviceWorker' in navigator)) return false;

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            const endpoint = subscription.endpoint;
            await subscription.unsubscribe();

            await supabase
                .from('push_subscriptions')
                .delete()
                .eq('user_id', userId)
                .eq('endpoint', endpoint);
        }

        return true;
    } catch (err) {
        console.error('Error unsubscribing from push:', err);
        return false;
    }
};

/**
 * Check if the current browser is subscribed to push notifications.
 */
export const isPushSubscribed = async (): Promise<boolean> => {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        return !!subscription;
    } catch {
        return false;
    }
};
