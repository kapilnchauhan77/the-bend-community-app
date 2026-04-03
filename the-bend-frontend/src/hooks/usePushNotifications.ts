import { useCallback, useState } from 'react';
import { notificationApi } from '@/services/notificationApi';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      });
      const json = subscription.toJSON();
      await notificationApi.registerPushSubscription({
        endpoint: json.endpoint!,
        keys: json.keys as Record<string, string>,
      });
      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return false;
    }
  }, []);

  return { permission, isSubscribed, requestPermission, subscribe };
}
