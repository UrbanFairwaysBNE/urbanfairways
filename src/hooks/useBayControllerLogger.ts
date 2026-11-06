import { useCallback, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LogEventType = 
  | 'app_launch' 
  | 'app_close_scheduled' 
  | 'app_close_manual' 
  | 'app_close_unexpected'
  | 'plug_on'
  | 'plug_off'
  | 'booking_active'
  | 'booking_ended'
  | 'window_fixed'
  | 'notification_shown'
  | 'manual_override_start'
  | 'manual_override_end'
  | 'error'
  | 'controller_start'
  | 'connection_lost'
  | 'connection_restored'
  | 'automation_decision'
  | 'plug_control_result'
  | 'process_detection';

export type LogEventLevel = 'info' | 'warning' | 'error';

interface LogEntry {
  event_type: LogEventType;
  event_level: LogEventLevel;
  message: string;
  details?: Record<string, unknown>;
  booking_id?: string;
  local_timestamp?: string;
}

interface UseBayControllerLoggerOptions {
  bayNumber: number | null;
  appVersion: string;
  enabled?: boolean;
}

export function useBayControllerLogger({ 
  bayNumber, 
  appVersion, 
  enabled = true 
}: UseBayControllerLoggerOptions) {
  const logQueueRef = useRef<LogEntry[]>([]);
  const isFlushingRef = useRef(false);
  const lastConnectionLogRef = useRef<{ connected: boolean; timestamp: number } | null>(null);
  
  // Flush queued logs to the server with explicit action
  const flushLogs = useCallback(async () => {
    if (!bayNumber || !enabled || isFlushingRef.current) {
      return;
    }
    
    isFlushingRef.current = true;
    const logsToSend = [...logQueueRef.current];
    logQueueRef.current = [];
    
    try {
      const lifecycle = await window.electronAPI?.getLifecycleEvents?.() || [];
      const lifecycleLogs: LogEntry[] = lifecycle.map(event => ({
        event_type: event.kind === 'controller_started' ? 'controller_start' : 'process_detection',
        event_level: /failed|unavailable|blocked|gap|crash/.test(event.kind) ? 'warning' : 'info',
        message: `[Lifecycle] ${event.kind}${typeof event.details.reason === 'string' ? `: ${event.details.reason}` : ''}`,
        details: { ...event.details, lifecycleEventId: event.id, controllerInstanceId: event.controllerInstanceId, sourceAppVersion: event.appVersion },
        booking_id: event.bookingId,
        local_timestamp: event.observedAt,
      }));
      if (!logsToSend.length && !lifecycleLogs.length) return;
      const { error } = await supabase.functions.invoke("bay-controller-api", {
        body: { logs: [...logsToSend, ...lifecycleLogs] },
        headers: {
          "x-bay-number": bayNumber.toString(),
          "x-app-version": appVersion,
          "x-action": "log", // Explicit action for logging
        },
      });
      
      if (error) {
        console.error("[BayLogger] Failed to send logs:", error);
        // Re-queue failed logs (up to 100 max)
        logQueueRef.current = [...logsToSend, ...logQueueRef.current].slice(0, 100);
      } else if (lifecycle.length) {
        await window.electronAPI?.acknowledgeLifecycleEvents?.(lifecycle.map(event => event.id));
      }
    } catch (err) {
      console.error("[BayLogger] Error sending logs:", err);
      // Re-queue failed logs
      logQueueRef.current = [...logsToSend, ...logQueueRef.current].slice(0, 100);
    } finally {
      isFlushingRef.current = false;
    }
  }, [bayNumber, appVersion, enabled]);
  
    // Unload flushing is best-effort; main-process evidence stays on disk until acknowledged.
  useEffect(() => {
    if (!enabled || !bayNumber) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // A normal authenticated flush may be interrupted by unload.
        flushLogs();
      }
    };
    
    const handleBeforeUnload = () => {
      flushLogs();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, bayNumber, flushLogs]);
  
  // Add a log entry to the queue
  const sendLog = useCallback((
    eventType: LogEventType,
    message: string,
    options?: {
      level?: LogEventLevel;
      details?: Record<string, unknown>;
      bookingId?: string;
      immediate?: boolean;
    }
  ) => {
    if (!bayNumber || !enabled) return;
    
    const entry: LogEntry = {
      event_type: eventType,
      event_level: options?.level || 'info',
      message,
      details: options?.details,
      booking_id: options?.bookingId,
      local_timestamp: new Date().toISOString(),
    };
    
    logQueueRef.current.push(entry);
    console.log(`[BayLogger] ${entry.event_level.toUpperCase()}: ${message}`);
    
    // Flush immediately for errors or if requested
    if (options?.immediate || options?.level === 'error') {
      flushLogs();
    } else if (logQueueRef.current.length >= 5) {
      // Batch flush when queue reaches 5 entries
      flushLogs();
    }
  }, [bayNumber, enabled, flushLogs]);
  
  // Convenience methods for common log types
  const logAppLaunch = useCallback((appName: string, bookingId?: string) => {
    sendLog('app_launch', `App launched: ${appName}`, { bookingId });
  }, [sendLog]);
  
  const logAppClose = useCallback((appName: string, reason: 'scheduled' | 'manual' | 'unexpected', bookingId?: string) => {
    const eventType: LogEventType = `app_close_${reason}`;
    const level: LogEventLevel = reason === 'unexpected' ? 'warning' : 'info';
    sendLog(eventType, `App closed (${reason}): ${appName}`, { level, bookingId });
  }, [sendLog]);
  
  const logPlugControl = useCallback((action: 'on' | 'off', plugName: string, isManual: boolean, bookingId?: string) => {
    const eventType: LogEventType = action === 'on' ? 'plug_on' : 'plug_off';
    sendLog(eventType, `Plug ${action.toUpperCase()}: ${plugName}${isManual ? ' (manual)' : ''}`, { 
      details: { isManual, plugName },
      bookingId 
    });
  }, [sendLog]);
  
  const logBookingActive = useCallback((customerName: string, startTime: string, endTime: string, bookingId: string) => {
    sendLog('booking_active', `Booking activated: ${customerName} (${startTime}-${endTime})`, { bookingId });
  }, [sendLog]);
  
  const logBookingEnded = useCallback((customerName: string, bookingId: string) => {
    sendLog('booking_ended', `Booking ended: ${customerName}`, { bookingId });
  }, [sendLog]);
  
  const logManualOverride = useCallback((isManual: boolean) => {
    const eventType: LogEventType = isManual ? 'manual_override_start' : 'manual_override_end';
    const level: LogEventLevel = isManual ? 'warning' : 'info';
    sendLog(eventType, isManual ? 'Manual mode activated' : 'Auto mode resumed', { level });
  }, [sendLog]);
  
  const logError = useCallback((message: string, error?: unknown, bookingId?: string) => {
    const details: Record<string, unknown> = {};
    if (error instanceof Error) {
      details.errorMessage = error.message;
      details.stack = error.stack;
    } else if (error) {
      details.error = String(error);
    }
    sendLog('error', message, { level: 'error', details, bookingId, immediate: true });
  }, [sendLog]);
  
  const logControllerStart = useCallback(() => {
    sendLog('controller_start', `Bay controller started (v${appVersion})`, { immediate: true });
  }, [sendLog, appVersion]);
  
  const logConnectionStatus = useCallback((connected: boolean) => {
    const now = Date.now();
    const last = lastConnectionLogRef.current;
    
    // Dedupe: Skip logging if same state was logged within the last 60 seconds
    // This prevents spam from normal polling/heartbeat cycles
    if (last && last.connected === connected && (now - last.timestamp) < 60000) {
      return;
    }
    
    lastConnectionLogRef.current = { connected, timestamp: now };
    
    const eventType: LogEventType = connected ? 'connection_restored' : 'connection_lost';
    const level: LogEventLevel = connected ? 'info' : 'warning';
    sendLog(eventType, connected ? 'Connection restored' : 'Connection lost', { level, immediate: true });
  }, [sendLog]);
  
  const logWindowFixed = useCallback((appName: string) => {
    sendLog('window_fixed', `Window position corrected: ${appName}`);
  }, [sendLog]);
  
  const logNotificationShown = useCallback((notificationType: string, bookingId?: string) => {
    sendLog('notification_shown', `Notification shown: ${notificationType}`, { bookingId });
  }, [sendLog]);
  
  // New: Log automation decision with full context
  const logAutomationDecision = useCallback((
    decision: 'plug_on' | 'plug_off' | 'app_launch' | 'app_close' | 'no_action',
    reason: string,
    context: {
      bookingId?: string;
      bookingWindow?: { start: string; end: string };
      preStartMinutes?: number;
      localTime?: string;
      serverTimeOffset?: number;
    }
  ) => {
    sendLog('automation_decision', `Automation decision: ${decision} - ${reason}`,
      {
        details: {
          decision,
          reason,
          ...context,
          timestamp: new Date().toISOString(),
        },
        bookingId: context.bookingId,
      }
    );
  }, [sendLog]);
  
  // New: Log plug control result with per-plug details
  const logPlugControlResult = useCallback((
    action: 'on' | 'off',
    results: Array<{ plugName: string; ip: string; success: boolean; error?: string }>,
    totalRuntimeMs: number,
    bookingId?: string
  ) => {
    const successCount = results.filter(r => r.success).length;
    const level: LogEventLevel = successCount === results.length ? 'info' : 'warning';
    
    sendLog('plug_control_result', `Plug ${action.toUpperCase()} completed: ${successCount}/${results.length} successful (${totalRuntimeMs}ms)`, {
      level,
      details: {
        action,
        results,
        totalRuntimeMs,
        allSuccessful: successCount === results.length,
      },
      bookingId,
    });
  }, [sendLog]);

  // Memoize the returned object so consumers don't re-run effects every render
  return useMemo(() => {
    return {
      sendLog,
      flushLogs,
      logAppLaunch,
      logAppClose,
      logPlugControl,
      logBookingActive,
      logBookingEnded,
      logManualOverride,
      logError,
      logControllerStart,
      logConnectionStatus,
      logWindowFixed,
      logNotificationShown,
      logAutomationDecision,
      logPlugControlResult,
    };
  }, [
    sendLog,
    flushLogs,
    logAppLaunch,
    logAppClose,
    logPlugControl,
    logBookingActive,
    logBookingEnded,
    logManualOverride,
    logError,
    logControllerStart,
    logConnectionStatus,
    logWindowFixed,
    logNotificationShown,
    logAutomationDecision,
    logPlugControlResult,
  ]);
}

