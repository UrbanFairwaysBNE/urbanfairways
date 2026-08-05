import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

export const usePushNotifications = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Save token to database
  const saveTokenToDatabase = async (pushToken: string, uId: string) => {
    try {
      console.log('[PUSH] Saving token to database for user:', uId);

      const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

      const { error } = await supabase
        .from('push_tokens')
        .upsert(
          { 
            user_id: uId, 
            token: pushToken, 
            platform,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,token' }
        );

      if (error) {
        console.error('[PUSH] Failed to save push token:', error);
      } else {
        console.log('[PUSH] Push token saved successfully!');
      }
    } catch (err) {
      console.error('[PUSH] Error saving push token:', err);
    }
  };

  // Subscribe to auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[PUSH] Auth state changed:', event, session?.user?.id);
        setUserId(session?.user?.id ?? null);
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[PUSH] Initial session user:', session?.user?.id);
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize push notifications on native platform
  useEffect(() => {
    const initPushNotifications = async () => {
      if (!Capacitor.isNativePlatform()) {
        console.log('[PUSH] Not on native platform, skipping push setup');
        return;
      }

      console.log('[PUSH] Initializing push notifications on native platform');
      setIsSupported(true);

      // IMPORTANT: Add listeners BEFORE registering, otherwise the token callback can be missed.
      PushNotifications.addListener('registration', async (tokenData) => {
        console.log('[PUSH] ✅ Registration SUCCESS! Token:', tokenData.value.substring(0, 20) + '...');
        setToken(tokenData.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('[PUSH] ❌ Registration ERROR:', JSON.stringify(error));
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[PUSH] Notification received:', JSON.stringify(notification));
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('[PUSH] Notification action:', JSON.stringify(notification));
      });

      try {
        // Check current permission status first
        const currentStatus = await PushNotifications.checkPermissions();
        console.log('[PUSH] Current permission status:', currentStatus.receive);

        let permStatus = currentStatus;
        
        // Request permission if not already granted
        if (currentStatus.receive !== 'granted') {
          console.log('[PUSH] Requesting permission...');
          permStatus = await PushNotifications.requestPermissions();
          console.log('[PUSH] Permission response:', permStatus.receive);
        }
        
        if (permStatus.receive === 'granted') {
          console.log('[PUSH] Permission granted, registering with push provider...');
          await PushNotifications.register();
          console.log('[PUSH] Registration request sent');
        } else {
          console.log('[PUSH] Permission denied or not determined:', permStatus.receive);
        }
      } catch (err) {
        console.error('[PUSH] Error during permission/registration:', err);
      }
    };

    initPushNotifications();

    return () => {
      if (!Capacitor.isNativePlatform()) return;
      PushNotifications.removeAllListeners();
    };

  }, []);

  // Save token when we have both token and userId
  useEffect(() => {
    if (token && userId) {
      console.log('[PUSH] Have both token and userId, saving to database');
      saveTokenToDatabase(token, userId);
    }
  }, [userId, token]);

  return { token, isSupported };
};
