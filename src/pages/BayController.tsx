import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Lock, Wifi, Power, Clock, AlertTriangle, CheckCircle, XCircle, Settings, RefreshCw, Monitor, Play, Square, FolderOpen, ChevronDown, ChevronUp, Bell, X, Trash2, TestTube, User, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addMinutes, isBefore, isAfter, parseISO } from "date-fns";
import { restoreUserGsproSettings, saveUserGsproSettings, uploadRangeCsv } from "@/lib/range-sync";
import { PlugDiagnostics } from "@/components/bay-controller/PlugDiagnostics";
import { AppRestoreSettings } from "@/components/bay-controller/AppRestoreSettings";
import { ControllerPasswordSettings } from "@/components/bay-controller/ControllerPasswordSettings";
import { verifyControllerPassword } from "@/lib/bay-controller-password";

interface Booking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  player_count: number;
  status: string;
  user_id?: string;
  customer_name?: string;
  sgt_user_id?: number | null;
  sgt_username?: string | null;
  sgt_game_id?: string | null;
}

interface TapoPlug {
  id: string;
  name: string;
  ip: string;
  isOn: boolean;
  deviceId?: string;
  /** Set by the operator — never inferred from the plug nickname. */
  type?: 'monitor' | 'projector';
  /** Burned-in MAC address — the stable identity used to re-find the plug
   *  after a DHCP lease change. IP is only a cached hint. */
  mac?: string;
  nickname?: string;
  model?: string;
  firmware?: string;
  firmwareRisk?: boolean;
}


interface BayPlugAssignment {
  bayNumber: number;
  plugs: TapoPlug[];
}

interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  isPrimary: boolean;
  signature: string; // "widthxheight" for matching
}

interface AppLaunchConfig {
  gsproPath: string;
  proteeLabsPath: string;
  gsproDisplayLabel: string; // Display label (e.g., "SAMSUNG", "BENQ PJ") for GSPRO
  proteeDisplayLabel: string; // Display label for Protee (touchscreen)
  appLaunchMinutes: number; // Minutes before booking to launch apps (after plugs are on)
  appCloseSeconds: number; // Seconds before booking end to close apps (before plugs turn off)
  enabled: boolean;
}

interface NotificationConfig {
  enabled: boolean;
  displayLabel: string; // Which display to show notification on
  notifications: {
    id: string;
    minutesBefore: number;
    message: string;
    enabled: boolean;
    durationSeconds: number; // How long to show the notification
    showExtendQr?: boolean; // Show QR code linking to extend booking
  }[];
}


// ActiveNotification interface removed - now using Electron popup windows

// Helper to find display by label (name)
const findDisplayByLabel = (displays: DisplayInfo[], label: string): DisplayInfo | undefined => {
  return displays.find(d => d.label === label);
};

// Import Electron types
import "@/types/electron.d";
import { useBayControllerLogger } from "@/hooks/useBayControllerLogger";
import { useTenant, hubUrl } from "@/config/tenant";

const FALLBACK_VERSION = "1.0.7";

// Debug log for Electron builds
console.log(`Bay Controller v${FALLBACK_VERSION} starting...`, {
  isElectron: typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'
});

// Collapsible Settings Card Component
function CollapsibleSettingsCard({ 
  title, 
  icon, 
  children, 
  defaultOpen = true,
  headerAction
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
  headerAction?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
          <CardTitle className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 flex-1">
                {icon}
                {title}
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {headerAction}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardTitle>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function BayController() {
  const { tenant } = useTenant();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [appVersion, setAppVersion] = useState(FALLBACK_VERSION);
  
  // Quit confirmation state
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [quitPassword, setQuitPassword] = useState("");
  const [quitPasswordError, setQuitPasswordError] = useState("");
  
  const [selectedBay, setSelectedBay] = useState<number | null>(() => {
    const saved = localStorage.getItem("bayController_selectedBay");
    return saved ? parseInt(saved) : null;
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  
  const [discoveredPlugs, setDiscoveredPlugs] = useState<TapoPlug[]>(() => {
    const saved = localStorage.getItem("bayController_discoveredPlugs");
    return saved ? JSON.parse(saved) : [];
  });
  const [bayPlugAssignments, setBayPlugAssignments] = useState<BayPlugAssignment[]>(() => {
    const saved = localStorage.getItem("bayController_bayPlugAssignments");
    return saved ? JSON.parse(saved) : [];
  });
  const [plugAssignmentsLoaded, setPlugAssignmentsLoaded] = useState(false);
  const [isDiscoveringPlugs, setIsDiscoveringPlugs] = useState(false);

  /**
   * Persist a plug's new IP after the controller re-resolved it by MAC address.
   * Keeps both the discovered list and the bay assignments in sync so the next
   * control call hits the fast path straight away.
   */
  const applyResolvedIp = (plugId: string, resolvedIp: string) => {
    if (!resolvedIp) return;
    console.log(`[Plugs] Plug ${plugId} moved to ${resolvedIp} — updating cached IP`);
    setDiscoveredPlugs(prev => {
      const updated = prev.map(p => (p.id === plugId ? { ...p, ip: resolvedIp } : p));
      localStorage.setItem("bayController_discoveredPlugs", JSON.stringify(updated));
      return updated;
    });
    setBayPlugAssignments(prev => {
      const updated = prev.map(a => ({
        ...a,
        plugs: a.plugs.map(p => (p.id === plugId ? { ...p, ip: resolvedIp } : p)),
      }));
      localStorage.setItem("bayController_bayPlugAssignments", JSON.stringify(updated));
      return updated;
    });
  };

  const [preStartMinutes, setPreStartMinutes] = useState(3);
  const [warningMinutes, setWarningMinutes] = useState([5, 1]);
  const [showSettings, setShowSettings] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [plugsStatus, setPlugsStatus] = useState({ monitor: false, projector: false });
  const [manualOverride, setManualOverride] = useState(false); // Prevents auto-control when manually controlling
  const [bayDeviceId, setBayDeviceId] = useState<string | null>(null); // Track bay_devices record for mode sync
  
  // TAPO credentials state
  const [tapoEmail, setTapoEmail] = useState("");
  const [tapoPassword, setTapoPassword] = useState("");
  const [isElectron, setIsElectron] = useState(false);

  // App Launch state
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [appLaunchConfig, setAppLaunchConfig] = useState<AppLaunchConfig>({
    gsproPath: "C:\\Program Files\\GSPro\\GSPro.exe",
    proteeLabsPath: "C:\\Program Files\\ProTee Labs\\ProTee Labs.exe",
    gsproDisplayLabel: "", // Will be set when display is selected (e.g., "SAMSUNG")
    proteeDisplayLabel: "", // Will be set when display is selected (e.g., "BENQ PJ")
    appLaunchMinutes: 1, // 1 minute before booking (after plugs turn on at 3 mins)
    appCloseSeconds: 15, // 15 seconds before booking end to close apps (before plugs turn off)
    enabled: false
  });
  const [isLaunchingApps, setIsLaunchingApps] = useState(false);
  const [appLaunchStatus, setAppLaunchStatus] = useState<string | null>(null);
  const [appsRunning, setAppsRunning] = useState(() => {
    const saved = localStorage.getItem("bayController_appsRunning");
    return saved === "true";
  });
  const [isTestingLogin, setIsTestingLogin] = useState(false);
  const [loginTestResult, setLoginTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // State for manual plug entry
  const [newPlugName, setNewPlugName] = useState("");
  const [newPlugIp, setNewPlugIp] = useState("");
  const [newPlugMac, setNewPlugMac] = useState("");
  const [newPlugType, setNewPlugType] = useState<'monitor' | 'projector' | undefined>(undefined);
  const [isIdentifyingPlug, setIsIdentifyingPlug] = useState(false);

  
  // Debug log state for in-app viewing
  const [debugLogs, setDebugLogs] = useState<{ time: string; message: string; type: 'info' | 'error' | 'success' }[]>([]);
  
  // Notification state
  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>(() => {
    const saved = localStorage.getItem("bayController_notificationConfig");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old config without durationSeconds
      if (parsed.notifications) {
        parsed.notifications = parsed.notifications.map((n: any) => ({
          ...n,
          durationSeconds: n.durationSeconds || 30 // Default to 30 seconds
        }));
      }
      return parsed;
    }
    return {
      enabled: true,
      displayLabel: "",
      notifications: [
        { id: "5min", minutesBefore: 5, message: "Hi {firstName}, your session ends in 5 minutes. Please book more time now if needed.", enabled: true, durationSeconds: 30, showExtendQr: true },
        { id: "1min", minutesBefore: 1, message: "Hi {firstName}, your session will shutdown in 1 minute.", enabled: true, durationSeconds: 30, showExtendQr: false }
      ]
    };
  });
  // activeNotification state removed - now using Electron popup windows
  const [shownNotifications, setShownNotifications] = useState<Set<string>>(new Set());
  
  // Track shown changeover welcomes to prevent duplicates
  const [shownChangeoverWelcomes, setShownChangeoverWelcomes] = useState<Set<string>>(new Set());
  
  // Flag to suppress "unexpected close" events during intentional app closures (changeover, end-of-session)
  const intentionalCloseInProgressRef = useRef(false);

  // Timestamp of the last intentional app-close, used to prevent immediate auto-relaunch races
  const lastIntentionalAppCloseAtRef = useRef<number | null>(null);
  const swingLabSyncInProgressRef = useRef(false);
  const lastSwingLabSyncAtRef = useRef(0);
  const lastGsproRunningRef = useRef<boolean | null>(null);
  // Latest activeBooking pinned in a ref so the Desktop CSV watcher listener
  // (mounted once on isElectron change) always sees current booking context
  // without re-subscribing on every render.
  const activeBookingRef = useRef<Booking | null>(null);
  
  // Guard against re-entrant launchApps calls and cooldown after failed launches
  const launchInProgressRef = useRef(false);
  const launchFailedCooldownUntilRef = useRef<number>(0);
  
  // Timestamp of the last plug-on event, used to calculate timing gap at app launch
  const lastPlugOnTimeRef = useRef<number | null>(null);
  
  
  // Auto-update state
  const [updateDownloaded, setUpdateDownloaded] = useState<string | null>(null);
  const [updateDownloading, setUpdateDownloading] = useState(false);

  // Kiosk Mode state
  const [kioskEnabled, setKioskEnabled] = useState<boolean>(() => {
    return localStorage.getItem("bayController_kioskEnabled") === "true";
  });
  const [kioskUnlockOpen, setKioskUnlockOpen] = useState(false);
  const [kioskUnlockPassword, setKioskUnlockPassword] = useState("");
  const [kioskUnlockError, setKioskUnlockError] = useState("");

  
  // Centralized logging hook for backend logs
  const bayLogger = useBayControllerLogger({
    bayNumber: selectedBay,
    appVersion: appVersion,
    enabled: isElectron, // Only log when running in Electron desktop app
  });
  
  // Fetch real version from Electron at startup
  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
  }, []);

  // Kiosk Mode: sync to main process + listen for unlock hotkey
  useEffect(() => {
    const api: any = (window as any).electronAPI;
    if (!api?.isElectron) return;
    // Push current state + selected bay to main process on mount + on change
    if (typeof api.setKioskMode === 'function') {
      api.setKioskMode(kioskEnabled, selectedBay).catch(() => {});
    }
  }, [kioskEnabled, selectedBay]);


  useEffect(() => {
    const api: any = (window as any).electronAPI;
    if (!api?.isElectron || typeof api.onRequestKioskUnlock !== 'function') return;
    const cleanup = api.onRequestKioskUnlock(() => {
      setKioskUnlockPassword("");
      setKioskUnlockError("");
      setKioskUnlockOpen(true);
    });
    return cleanup;
  }, []);

  const toggleKiosk = (enable: boolean) => {
    if (enable) {
      localStorage.setItem("bayController_kioskEnabled", "true");
      setKioskEnabled(true);
      toast.success("Kiosk Mode enabled — press Ctrl+Alt+1 to unlock");
    } else {
      localStorage.setItem("bayController_kioskEnabled", "false");
      setKioskEnabled(false);
      toast.info("Kiosk Mode disabled");
    }
  };

  const handleKioskUnlock = async () => {
    if (await verifyControllerPassword(kioskUnlockPassword)) {
      toggleKiosk(false);
      setKioskUnlockOpen(false);
      setKioskUnlockPassword("");
      setKioskUnlockError("");
    } else {
      setKioskUnlockError("Incorrect password");
    }
  };


  // Helper to add debug log
  const addLog = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    // Always Brisbane time so logs match the venue clock regardless of the PC's OS timezone
    const time = new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour12: false });
    setDebugLogs(prev => [...prev.slice(-49), { time, message, type }]); // Keep last 50 logs
  }, []);

  // ── League Highlights: single finalizer used by BOTH the SGT stop command and
  // the local hard-stop watchdog. A recording must never outlive its booking.
  const finalizingRecordingRef = useRef(false);
  const finalizeRecording = useCallback(async (sessionId: string, reason: string) => {
    if (!sessionId) return;
    if (finalizingRecordingRef.current) {
      addLog(`[Highlights] Stop already in progress — ignoring duplicate (${reason})`, 'info');
      return;
    }
    finalizingRecordingRef.current = true;
    try {
      const electronApi: any = (window as any).electronAPI;
      addLog(`[Highlights] Stopping OBS recording for session ${sessionId} (${reason})`, 'info');
      const stopRes = await electronApi?.obsStopRecording?.();
      if (!stopRes?.success || !stopRes.filePath) {
        addLog(`[Highlights] OBS stop failed: ${stopRes?.error ?? 'no file'}`, 'error');
        await supabase.functions.invoke('bay-controller-api', {
          headers: { 'x-bay-number': String(selectedBay ?? ''), 'x-action': 'recording_stop' },
          body: { recording_session_id: sessionId, status: 'error', error_message: stopRes?.error ?? 'no file' },
        });
        (window as any).__activeRecording = null;
        return;
      }

      // Direct-to-Cloudflare Stream via tus. No Supabase Storage hop, no 2 GiB cap.
      // Re-measure the file until the size is stable: OBS can still be flushing the
      // remuxed MP4 when it reports the stop, and a declared Upload-Length that
      // doesn't match the bytes we send makes Cloudflare reject the final chunk.
      const stableRes = await electronApi?.obsFileSize?.(stopRes.filePath);
      const sizeBytes = stableRes?.sizeBytes ?? stopRes.sizeBytes ?? 0;
      const isMp4 = typeof stopRes.filePath === 'string' && stopRes.filePath.toLowerCase().endsWith('.mp4');
      const rec = (window as any).__activeRecording;
      const durationSec = rec?.startedAtMs ? (Date.now() - rec.startedAtMs) / 1000 : null;

      const failStop = async (msg: string) => {
        addLog(`[Highlights] ${msg}`, 'error');
        await supabase.functions.invoke('bay-controller-api', {
          headers: { 'x-bay-number': String(selectedBay ?? ''), 'x-action': 'recording_stop' },
          body: { recording_session_id: sessionId, status: 'error', error_message: msg },
        });
      };

      if (!sizeBytes) {
        await failStop('Recording file is empty — nothing to upload');
      } else {
        const { data: tusData } = await supabase.functions.invoke('bay-controller-api', {
          headers: { 'x-bay-number': String(selectedBay ?? ''), 'x-action': 'recording_stream_upload_url' },
          body: { recording_session_id: sessionId, size_bytes: sizeBytes },
        });

        if (!tusData?.upload_url) {
          await failStop(`Could not create Cloudflare upload: ${tusData?.error ?? 'no upload URL'}`);
        } else {
          addLog(`[Highlights] Uploading to Cloudflare Stream: ${Math.round(sizeBytes / 1024 / 1024)} MB (${isMp4 ? 'MP4' : 'MKV'})`, 'info');
          const upRes = await electronApi?.obsTusUpload?.(stopRes.filePath, tusData.upload_url, sizeBytes);
          if (upRes?.success) {
            await supabase.functions.invoke('bay-controller-api', {
              headers: { 'x-bay-number': String(selectedBay ?? ''), 'x-action': 'recording_hole' },
              body: { recording_session_id: sessionId, hole_number: 0, clip_start_seconds: 0, clip_end_seconds: durationSec },
            });
            await supabase.functions.invoke('bay-controller-api', {
              headers: { 'x-bay-number': String(selectedBay ?? ''), 'x-action': 'recording_stop' },
              body: {
                recording_session_id: sessionId,
                file_size_bytes: upRes.sizeBytes ?? sizeBytes,
                status: 'uploaded',
                stream_uid: tusData.stream_uid,
              },
            });
            await electronApi?.obsDeleteFile?.(stopRes.filePath).catch(() => undefined);
            if (isMp4 && stopRes.mkvPath && stopRes.mkvPath !== stopRes.filePath) {
              await electronApi?.obsDeleteFile?.(stopRes.mkvPath).catch(() => undefined);
            }
            addLog(`[Highlights] Session ${sessionId} uploaded to Cloudflare (${tusData.stream_uid})`, 'success');
          } else {
            // Leave the local file in place so it can be retried manually.
            await failStop(`Cloudflare upload failed: ${upRes?.error ?? 'unknown'}`);
          }
        }
      }
      (window as any).__activeRecording = null;
    } catch (e) {
      addLog(`[Highlights] Stop handler error: ${(e as Error).message}`, 'error');
    } finally {
      finalizingRecordingRef.current = false;
    }
  }, [addLog, selectedBay]);



  // Track active booking changes for logging
  const previousActiveBookingRef = useRef<Booking | null>(null);
  
  useEffect(() => {
    const prevBooking = previousActiveBookingRef.current;
    const currBooking = activeBooking;
    
    // Booking started (null -> booking OR different booking)
    if (currBooking && (!prevBooking || prevBooking.id !== currBooking.id)) {
      bayLogger.logBookingActive(
        currBooking.customer_name || 'Unknown',
        currBooking.start_time,
        currBooking.end_time,
        currBooking.id
      );
    }
    
    // Booking ended (booking -> null OR different booking)
    if (prevBooking && (!currBooking || currBooking.id !== prevBooking.id)) {
      bayLogger.logBookingEnded(
        prevBooking.customer_name || 'Unknown',
        prevBooking.id
      );
    }
    
    previousActiveBookingRef.current = currBooking;
  }, [activeBooking, bayLogger]);

  // =====================================================
  // LEAGUE HIGHLIGHTS: Round-only recording
  // =====================================================
  // Recording is now driven entirely by the sgt-highlight-poller edge
  // function. It watches the SGT embed / local comp scoreboard and issues
  // `obs_start_recording:session_id=<uuid>` and `obs_stop_recording:session_id=<uuid>`
  // commands via the bay_commands table. Handling for those commands lives
  // in the bay_commands subscription below — the old booking-lifecycle
  // start/stop effect was removed so we no longer capture range/idle time.





  // GSPro-close hook. Settings capture now happens at T-3min before session
  // end (see effect further down) — NOT on close — so this callback is now
  // just a logging shell. Desktop CSV uploads are handled by the always-on
  // watcher (electron/main.js -> desktop-csv-detected -> uploadRangeCsv).
  const runSwingLabCloseSync = useCallback(async (
    trigger: string,
    _override?: { userId: string; bookingId?: string | null; bookingStartMs?: number | null }
  ) => {
    addLog(`[Sync] GSPro close event (${trigger}) — settings capture happens at T-3min, not on close`, 'info');
    bayLogger.sendLog('automation_decision', `[Sync] GSPro close event (${trigger}) — settings capture happens at T-3min, not on close`, {
      bookingId: activeBooking?.id,
    });
  }, [activeBooking?.id, bayLogger, addLog]);

  // T-3min settings capture: 3 minutes before the active booking ends, upload
  // the customer's current GSPro settings so their next session picks up
  // whatever they had at the end of THIS one. Always uploads (no hash-compare).
  // Reschedules automatically when the booking changes (e.g. extension).
  useEffect(() => {
    if (!isElectron) return;
    if (!activeBooking?.user_id || !activeBooking.booking_date || !activeBooking.end_time) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = async () => {
      try {
        const cfg = await window.electronAPI?.getBaselineConfig();
        if (!cfg?.enabled) {
          addLog('[Settings T-3min] App Restore disabled — skipping capture schedule', 'info');
          return;
        }
      } catch { /* non-fatal */ }

      const endMs = new Date(`${activeBooking.booking_date}T${activeBooking.end_time}`).getTime();
      const fireAt = endMs - 3 * 60 * 1000;
      const delay = fireAt - Date.now();

      if (delay <= 0) {
        addLog(`[Settings T-3min] Booking ends in <3min — skipping capture for this session`, 'info');
        bayLogger.sendLog('automation_decision', `[Settings T-3min] Booking ends in <3min — skipping capture`, { bookingId: activeBooking.id });
        return;
      }

      addLog(`[Settings T-3min] Scheduled capture in ${Math.round(delay / 1000)}s (${new Date(fireAt).toISOString()})`, 'info');
      bayLogger.sendLog('automation_decision', `[Settings T-3min] Scheduled capture in ${Math.round(delay / 1000)}s`, { bookingId: activeBooking.id });

      timer = setTimeout(async () => {
        if (cancelled) return;
        try {
          addLog(`[Settings T-3min] Capturing settings for user ${activeBooking.user_id}`, 'info');
          bayLogger.sendLog('automation_decision', `[Settings T-3min] Capturing settings for user ${activeBooking.user_id}`, { bookingId: activeBooking.id });
          const saved = await saveUserGsproSettings(activeBooking.user_id!, {
            bayNumber: selectedBay,
            bookingId: activeBooking.id,
            appVersion,
            log: (msg, level) => {
              const mapped: 'info' | 'success' | 'error' = level === 'warning' ? 'info' : (level ?? 'info');
              addLog(msg, mapped);
              bayLogger.sendLog('automation_decision', msg, {
                level: level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'info',
                bookingId: activeBooking.id,
              });
            },
          });
          addLog(`[Settings T-3min] Result: saved=[${saved.saved.join(', ') || 'none'}] failed=[${saved.failed.join(', ') || 'none'}]`, saved.failed.length ? 'error' : 'success');
        } catch (e: any) {
          addLog(`[Settings T-3min] Capture threw: ${e?.message ?? String(e)}`, 'error');
          bayLogger.logError('[Settings T-3min] Capture exception', e, activeBooking.id);
        }
      }, delay);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isElectron, activeBooking?.id, activeBooking?.user_id, activeBooking?.booking_date, activeBooking?.end_time, selectedBay, appVersion, bayLogger, addLog]);


  // Listen for F10 global hotkey results from main process
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    
    const cleanupNoConfig = window.electronAPI.onF10NoConfig(() => {
      toast.error("App launch not configured");
    });
    
    const cleanupNotFound = window.electronAPI.onF10DisplaysNotFound(() => {
      toast.error("Configured displays not found");
    });
    
    const cleanupResult = window.electronAPI.onF10Result((result) => {
      if (result.success && result.results) {
        const moved = result.results.filter(r => r.moved);
        const found = result.results.filter(r => r.found);
        
        if (moved.length > 0) {
          toast.success(`Moved ${moved.map(r => r.app).join(' & ')} to correct screen`);
        } else if (found.length > 0) {
          toast.info("Windows already on correct screens");
        } else {
          toast.warning("Windows not found - are apps running?");
        }
      }
    });
    
    const cleanupError = window.electronAPI.onF10Error((error) => {
      console.error('[BayController] F10 window fix failed:', error);
      toast.error("Failed to fix window positions");
    });
    
    // Listen for unexpected GSPro closure (closed externally, not by our automation)
    const cleanupGsproClosed = window.electronAPI.onGsproClosed?.(async () => {
      console.log('[BayController] GSPro closed detected, intentionalClose:', intentionalCloseInProgressRef.current);
      if (appsRunning && !intentionalCloseInProgressRef.current) {
        bayLogger.logAppClose('GSPro', 'unexpected', activeBooking?.id);
        addLog('GSPro closed unexpectedly (not by automation)', 'error');
      }
      // Range session capture + per-customer GSPro settings snapshot
      runSwingLabCloseSync('electron gspro-closed event');
    });
    
    return () => {
      cleanupNoConfig();
      cleanupNotFound();
      cleanupResult();
      cleanupError();
      cleanupGsproClosed?.();
    };
  }, [isElectron, appsRunning, activeBooking?.id, bayLogger, addLog, runSwingLabCloseSync]);


  // Track previous booking ID to detect when a NEW booking starts
  const prevBookingIdRef = useRef<string | null>(null);
  
  


  // Check if running in Electron and load saved credentials/config
  useEffect(() => {
    const electronCheck = !!window.electronAPI?.isElectron;
    setIsElectron(electronCheck);
    
    // Log controller start when in Electron
    if (electronCheck) {
      // Delay slightly to ensure logger has bayNumber
      setTimeout(() => bayLogger.logControllerStart(), 1000);
    }
    
    // Mark plug assignments as loaded (they were loaded via useState initializer)
    setPlugAssignmentsLoaded(true);
    
    // Load saved TAPO credentials from localStorage
    const savedEmail = localStorage.getItem("bayController_tapoEmail");
    const savedPassword = localStorage.getItem("bayController_tapoPassword");
    if (savedEmail) setTapoEmail(savedEmail);
    if (savedPassword) setTapoPassword(savedPassword);
    
    // Load saved app launch config - merge with defaults to handle new fields
    const savedAppConfig = localStorage.getItem("bayController_appLaunchConfig");
    if (savedAppConfig) {
      const parsed = JSON.parse(savedAppConfig);
      setAppLaunchConfig(prev => ({ ...prev, ...parsed }));
    }
    
    // Note: selectedBay is now initialized directly from localStorage in useState
    
    // Load saved pre-start minutes
    const savedPreStart = localStorage.getItem("bayController_preStartMinutes");
    if (savedPreStart) {
      setPreStartMinutes(parseInt(savedPreStart));
    }
    
    // Get display info if in Electron
    if (electronCheck && window.electronAPI) {
      window.electronAPI.getDisplays().then(displayList => {
        setDisplays(displayList);
        console.log("Detected displays:", displayList);
      }).catch(err => {
        console.error("Failed to get displays:", err);
      });
      
      // Set up continuous display monitoring (check every 5 seconds for new/removed displays)
      // Also auto-fix window positions when saved config displays come back online
      const displayMonitorInterval = setInterval(async () => {
        try {
          const currentDisplays = await window.electronAPI!.getDisplays();
          setDisplays(prevDisplays => {
            // Check for changes silently
            const prevLabels = new Set(prevDisplays.map(d => d.label));
            const currentLabels = new Set(currentDisplays.map(d => d.label));
            
            // Log new displays silently
            const newDisplays = currentDisplays.filter(d => !prevLabels.has(d.label));
            if (newDisplays.length > 0) {
              console.log("New display(s) detected:", newDisplays.map(d => d.label));
            }
            
            // Log removed displays silently
            const removedDisplays = prevDisplays.filter(d => !currentLabels.has(d.label));
            if (removedDisplays.length > 0) {
              console.log("Display(s) disconnected:", removedDisplays.map(d => d.label));
            }
            
            return currentDisplays;
          });
        } catch (err) {
          // Silent failure - don't log errors to avoid console noise
        }
      }, 5000); // Check every 5 seconds
      
      // Listen for lock request from main process (when window shown from tray)
      const cleanupLock = window.electronAPI.onRequestLock(() => {
        console.log("Lock requested from main process");
        setIsAuthenticated(false);
        setPassword("");
        setPasswordError("");
        setShowQuitDialog(false);
      });
      
      // Listen for quit password request from main process
      const cleanupQuit = window.electronAPI.onRequestQuitPassword(() => {
        console.log("Quit password requested from main process");
        setShowQuitDialog(true);
        setQuitPassword("");
        setQuitPasswordError("");
      });
      
      // Listen for auto-update events
      const cleanupUpdateDownloaded = window.electronAPI.onUpdateDownloaded((version) => {
        console.log(`[AutoUpdater] Update downloaded: ${version}`);
        setUpdateDownloading(false);
        setUpdateDownloaded(version);
      });
      
      const cleanupUpdateError = window.electronAPI.onUpdateError?.((error) => {
        console.error(`[AutoUpdater] Update error: ${error}`);
        setUpdateDownloading(false);
        toast.error(`Update failed: ${error}`);
      });
      
      return () => {
        clearInterval(displayMonitorInterval);
        cleanupLock?.();
        cleanupQuit?.();
        cleanupUpdateDownloaded?.();
        cleanupUpdateError?.();
      };
    }
  }, []);

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle password submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[BayController] Password form submitted");
    if (await verifyControllerPassword(password)) {
      console.log("[BayController] Password correct, authenticating...");
      setIsAuthenticated(true);
      setPasswordError("");
      // Notify main process of authentication
      try {
        window.electronAPI?.setAuthenticated(true);
        console.log("[BayController] Notified main process of authentication");
      } catch (err) {
        console.error("[BayController] Error notifying main process:", err);
      }
    } else {
      console.log("[BayController] Incorrect password entered");
      setPasswordError("Incorrect password");
    }
  };
  // Handle quit password submission
  const handleQuitPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyControllerPassword(quitPassword)) {
      setQuitPasswordError("");
      // Confirm quit to main process - this will exit the app
      await window.electronAPI?.confirmQuit();
    } else {
      setQuitPasswordError("Incorrect password");
    }
  };

  // Cancel quit dialog
  const handleCancelQuit = () => {
    setShowQuitDialog(false);
    setQuitPassword("");
    setQuitPasswordError("");
  };

  // Track the previous bay to know when we're switching bays vs just refreshing
  const previousBayRef = useRef<number | null>(null);
  
  // Track last known API version for diagnostics
  const lastApiVersionRef = useRef<string | null>(null);
  
  // Offline fallback cache key
  const CACHE_KEY = "bayController_bookingsCache";
  const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

  // Save bookings to cache
  const cacheBookings = useCallback((bayNum: number, bookingsData: Booking[], serverTime: string) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        bayNumber: bayNum,
        bookings: bookingsData,
        serverTime,
        cachedAt: Date.now(),
      }));
    } catch (e) {
      console.warn("Failed to cache bookings:", e);
    }
  }, []);

  // Load bookings from cache if valid
  const loadCachedBookings = useCallback((bayNum: number): { bookings: Booking[]; cachedAt: number } | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      if (data.bayNumber !== bayNum) return null;
      
      const age = Date.now() - data.cachedAt;
      if (age > CACHE_MAX_AGE_MS) return null;
      
      return { bookings: data.bookings, cachedAt: data.cachedAt };
    } catch {
      return null;
    }
  }, []);

  // Fetch bookings for selected bay with explicit action and offline fallback
  const fetchBookings = useCallback(async () => {
    if (!selectedBay) return;
    
    const isSwitchingBays = previousBayRef.current !== null && previousBayRef.current !== selectedBay;
    previousBayRef.current = selectedBay;
    
    setIsLoadingBookings(true);
    setConnectionStatus("connecting");
    
    // Only reset state when switching bays, not when refreshing due to real-time updates
    if (isSwitchingBays) {
      setBookings([]);
      setActiveBooking(null);
      setPlugsStatus({ monitor: false, projector: false });
    }
    
    try {
      console.log(`[BayController] Fetching bookings for bay ${selectedBay}...`);
      const { data, error } = await supabase.functions.invoke("bay-controller-api", {
        body: { action: "bookings" },
        headers: {
          "x-bay-number": selectedBay.toString(),
          "x-app-version": appVersion,
          "x-action": "bookings", // Explicit action header
        },
      });

      console.log(`[BayController] API response - error:`, error, `data:`, data ? `${data.bookings?.length || 0} bookings` : 'null');

      if (error) {
        console.error(`[BayController] API returned error object:`, error);
        throw error;
      }
      
      if (!data) {
        console.error(`[BayController] API returned null data`);
        throw new Error("API returned null data");
      }
      
      // Track API version for diagnostics
      if (data._version) {
        lastApiVersionRef.current = data._version;
      }

      setBookings(data.bookings || []);
      setConnectionStatus("connected");
      
      
      // Cache successful response for offline fallback
      cacheBookings(selectedBay, data.bookings || [], data.server_time);
      
      // Sync control_mode from server response (reliable fallback if realtime fails)
      if (data.control_mode) {
        const isManual = data.control_mode === 'manual';
        setManualOverride(isManual);
        console.log(`Synced control mode from API: ${data.control_mode}`);
      }
      
      console.log(`Fetched ${data.bookings?.length || 0} bookings for bay ${selectedBay} (API v${data._version || 'unknown'})`);
    } catch (error: unknown) {
      console.error("Failed to fetch bookings:", error);
      
      // Enhanced error diagnostics
      const errorInfo = {
        timestamp: new Date().toISOString(),
        lastApiVersion: lastApiVersionRef.current,
        errorType: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        bayNumber: selectedBay,
        appVersion: appVersion,
      };
      console.error("Connection error details:", errorInfo);
      
      setConnectionStatus("disconnected");
      bayLogger.logError("Failed to connect to server", error);
      
      
      // Try to use cached bookings for offline fallback
      const cached = loadCachedBookings(selectedBay);
      if (cached) {
        const ageMinutes = Math.round((Date.now() - cached.cachedAt) / 60000);
        console.log(`Using cached bookings from ${ageMinutes} minutes ago`);
        setBookings(cached.bookings);
        addLog(`Offline mode: using cached data (${ageMinutes}min old)`, 'info');
        toast.warning(`Offline mode - using cached data (${ageMinutes}min old)`);
      } else {
        toast.error(`Failed to connect to server. ${errorInfo.errorType}: ${errorInfo.errorMessage}`);
      }
    } finally {
      setIsLoadingBookings(false);
    }
  }, [selectedBay, cacheBookings, loadCachedBookings, addLog, bayLogger]);

  // Send lightweight heartbeat with explicit action
  const sendHeartbeat = useCallback(async () => {
    if (!selectedBay) return;
    
    try {
      const { data, error } = await supabase.functions.invoke("bay-controller-api", {
        body: { action: "heartbeat" },
        headers: {
          "x-bay-number": selectedBay.toString(),
          "x-app-version": appVersion,
          "x-action": "heartbeat", // Explicit lightweight heartbeat
        },
      });
      
      if (error) throw error;
      
      // Track API version for diagnostics
      if (data?._version) {
        lastApiVersionRef.current = data._version;
      }
      
      // Sync control mode from heartbeat response
      if (data?.control_mode) {
        const isManual = data.control_mode === 'manual';
        if (isManual !== manualOverride) {
          setManualOverride(isManual);
          console.log(`Control mode synced from heartbeat: ${data.control_mode}`);
        }
      }
      
      // Restore connected status if we were disconnected
      setConnectionStatus(prev => {
        if (prev === "disconnected") {
          return "connected";
        }
        return prev;
      });
    } catch (error) {
      console.error("Heartbeat failed:", error);
      setConnectionStatus("disconnected");
    }
  }, [selectedBay, manualOverride, bayLogger]);

  // Fetch and sync control mode from database
  const fetchControlMode = useCallback(async () => {
    if (!selectedBay) return;
    
    try {
      // Get bay_id first
      const { data: bayData } = await supabase
        .from("bays")
        .select("id")
        .eq("bay_number", selectedBay)
        .maybeSingle();
      
      if (!bayData?.id) return;
      
      // Get bay_device for this bay
      const { data: deviceData } = await supabase
        .from("bay_devices")
        .select("id, control_mode")
        .eq("bay_id", bayData.id)
        .maybeSingle();
      
      if (deviceData) {
        setBayDeviceId(deviceData.id);
        setManualOverride(deviceData.control_mode === 'manual');
        console.log(`Bay ${selectedBay} control mode: ${deviceData.control_mode}`);
      }
    } catch (error) {
      console.error("Failed to fetch control mode:", error);
    }
  }, [selectedBay]);

  // Update control mode in database
  const updateControlMode = useCallback(async (isManual: boolean) => {
    if (!selectedBay) return;
    
    try {
      // If we have a bayDeviceId, update directly by id
      if (bayDeviceId) {
        const { error } = await supabase
          .from("bay_devices")
          .update({ 
            control_mode: isManual ? 'manual' : 'auto',
            updated_at: new Date().toISOString()
          })
          .eq("id", bayDeviceId);
        
        if (error) {
          console.error("Failed to update control mode:", error);
          toast.error("Failed to update control mode");
          return;
        }
        
        console.log(`Updated bay control mode to: ${isManual ? 'manual' : 'auto'}`);
        return;
      }
      
      // No bayDeviceId - need to get bay_id and upsert
      const { data: bayData } = await supabase
        .from("bays")
        .select("id")
        .eq("bay_number", selectedBay)
        .maybeSingle();
      
      if (!bayData?.id) {
        console.error("Could not find bay ID");
        return;
      }
      
      // Upsert bay_device with control_mode
      const { data: upsertData, error: upsertError } = await supabase
        .from("bay_devices")
        .upsert({
          bay_id: bayData.id,
          control_mode: isManual ? 'manual' : 'auto',
          is_online: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'bay_id' })
        .select("id")
        .single();
      
      if (upsertError) {
        console.error("Failed to upsert control mode:", upsertError);
        toast.error("Failed to update control mode");
        return;
      }
      
      // Update the bayDeviceId for future updates
      if (upsertData?.id) {
        setBayDeviceId(upsertData.id);
      }
      
      console.log(`Upserted bay control mode to: ${isManual ? 'manual' : 'auto'}`);
    } catch (error) {
      console.error("Failed to update control mode:", error);
    }
  }, [bayDeviceId, selectedBay]);

  // Keep booking/mode/heartbeat polling effects stable: avoid leaking channels/intervals on re-render
  const fetchBookingsRef = useRef(fetchBookings);
  const fetchControlModeRef = useRef(fetchControlMode);
  const sendHeartbeatRef = useRef(sendHeartbeat);
  const resumeAutoRef = useRef<() => void>(() => {});

  useEffect(() => {
    fetchBookingsRef.current = fetchBookings;
    fetchControlModeRef.current = fetchControlMode;
    sendHeartbeatRef.current = sendHeartbeat;
  }, [fetchBookings, fetchControlMode, sendHeartbeat]);

  // Set up real-time subscription for bookings, control mode, heartbeat, and polling fallback
  useEffect(() => {
    if (!selectedBay) return;

    let cancelled = false;
    let channels: { bookingChannel: ReturnType<typeof supabase.channel>; deviceChannel: ReturnType<typeof supabase.channel> } | null = null;

    // Initial fetch
    fetchBookingsRef.current();
    fetchControlModeRef.current();

    // Get bay_id for the selected bay number
    const setupRealtimeSubscription = async () => {
      const { data: bayData } = await supabase
        .from("bays")
        .select("id")
        .eq("bay_number", selectedBay)
        .maybeSingle();

      if (cancelled) return;

      if (!bayData?.id) {
        console.error("Could not find bay ID for bay number:", selectedBay);
        return;
      }

      // Subscribe to real-time changes on bookings table for this bay
      const bookingChannel = supabase
        .channel(`bay-${selectedBay}-bookings`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `bay_id=eq.${bayData.id}`,
          },
          () => {
            // Refetch bookings to get the latest data
            fetchBookingsRef.current();
          }
        )
        .subscribe();

      // Subscribe to real-time changes on bay_devices for mode sync from admin
      const deviceChannel = supabase
        .channel(`bay-${selectedBay}-device-mode`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'bay_devices',
            filter: `bay_id=eq.${bayData.id}`,
          },
          (payload) => {
            const newMode = (payload.new as { control_mode?: string }).control_mode;
            if (newMode) {
              const wasManual = manualOverrideRef.current;
              const isNowManual = newMode === 'manual';
              setManualOverride(isNowManual);
              
              // When switching from manual -> auto via remote toggle,
              // evaluate plug state immediately (turn off if no booking)
              if (wasManual && !isNowManual) {
                console.log('[Realtime] Mode changed to AUTO remotely, evaluating plug state');
                // Small delay to let state settle before resumeAuto reads it
                setTimeout(() => {
                  resumeAutoRef.current();
                }, 500);
              }
            }
          }
        )
        .subscribe();

      channels = { bookingChannel, deviceChannel };

      // If this effect already cleaned up before the async finished, remove immediately
      if (cancelled) {
        supabase.removeChannel(bookingChannel);
        supabase.removeChannel(deviceChannel);
      }
    };

    setupRealtimeSubscription();

    // Heartbeat to keep device status updated
    const heartbeatInterval = setInterval(() => sendHeartbeatRef.current(), 30000);

    // Track realtime connection status for intelligent polling
    let isRealtimeConnected = false;

    // Polling fallback - runs when realtime is disconnected
    const pollingInterval = setInterval(() => {
      if (!isRealtimeConnected) {
        fetchBookingsRef.current();
      }
    }, 15000);

    // Safety-net poll even when realtime is connected
    const activeBookingPollInterval = setInterval(() => {
      fetchBookingsRef.current();
    }, 30000);

    // Monitor realtime connection status
    const connectionChannel = supabase
      .channel('bay-controller-status')
      .subscribe((status) => {
        isRealtimeConnected = status === 'SUBSCRIBED';
      });

    return () => {
      cancelled = true;
      clearInterval(heartbeatInterval);
      clearInterval(pollingInterval);
      clearInterval(activeBookingPollInterval);
      supabase.removeChannel(connectionChannel);
      if (channels) {
        supabase.removeChannel(channels.bookingChannel);
        supabase.removeChannel(channels.deviceChannel);
      }
    };
  }, [selectedBay]);

  // Save bay selection
  useEffect(() => {
    if (selectedBay) {
      localStorage.setItem("bayController_selectedBay", selectedBay.toString());
    }
  }, [selectedBay]);

  // Refs to hold current state for admin command callbacks
  const bayPlugAssignmentsRef = useRef(bayPlugAssignments);
  const tapoEmailRef = useRef(tapoEmail);
  const tapoPasswordRef = useRef(tapoPassword);
  const isElectronRef = useRef(isElectron);
  const bookingsRef = useRef(bookings);
  const preStartMinutesRef = useRef(preStartMinutes);
  const bayDeviceIdRef = useRef(bayDeviceId);
  const manualOverrideRef = useRef(manualOverride);
  
  // Keep refs in sync with state
  useEffect(() => {
    bayPlugAssignmentsRef.current = bayPlugAssignments;
  }, [bayPlugAssignments]);
  
  useEffect(() => {
    tapoEmailRef.current = tapoEmail;
  }, [tapoEmail]);
  
  useEffect(() => {
    tapoPasswordRef.current = tapoPassword;
  }, [tapoPassword]);
  
  useEffect(() => {
    isElectronRef.current = isElectron;
  }, [isElectron]);
  
  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);
  
  useEffect(() => {
    preStartMinutesRef.current = preStartMinutes;
  }, [preStartMinutes]);
  
  useEffect(() => {
    bayDeviceIdRef.current = bayDeviceId;
  }, [bayDeviceId]);
  
  useEffect(() => {
    manualOverrideRef.current = manualOverride;
  }, [manualOverride]);

  // Helper to update control mode in DB (for use in command handler)
  const updateControlModeInDb = async (isManual: boolean) => {
    const deviceId = bayDeviceIdRef.current;
    if (!deviceId) return;
    
    try {
      await supabase
        .from("bay_devices")
        .update({ control_mode: isManual ? 'manual' : 'auto' })
        .eq("id", deviceId);
    } catch (error) {
      console.error("Failed to update control mode in DB:", error);
    }
  };

  // Subscribe to admin commands from bay_commands table
  useEffect(() => {
    if (!selectedBay) return;

    console.log(`Setting up admin command subscription for bay ${selectedBay}`);

    // Helper to get plugs for this bay using refs (avoids stale closure)
    const getPlugsForCommand = (): TapoPlug[] => {
      return bayPlugAssignmentsRef.current.find(a => a.bayNumber === selectedBay)?.plugs || [];
    };

    // Execute plug control directly in callback using refs
    const executePlugControl = async (action: 'on' | 'off', commandId: string) => {
      console.log(`Admin command: Turn ${action.toUpperCase()} plugs for bay ${selectedBay}`);
      
      const bayPlugs = getPlugsForCommand();
      console.log("Plugs for command:", JSON.stringify(bayPlugs, null, 2));
      
      if (bayPlugs.length === 0) {
        console.warn("No plugs assigned to this bay!");
        toast.warning("No plugs assigned to this bay");
        return;
      }
      
      if (!tapoEmailRef.current || !tapoPasswordRef.current) {
        console.error("TAPO credentials not configured");
        toast.error("TAPO credentials not configured");
        return;
      }
      
      if (!isElectronRef.current || !window.electronAPI) {
        console.error("Not running in Electron");
        return;
      }
      
      const newStatus = { monitor: false, projector: false };
      
      for (const plug of bayPlugs) {
        if (!plug.ip || typeof plug.ip !== 'string' || plug.ip.trim() === '') {
          console.error(`Invalid IP for plug ${plug.name}:`, plug);
          toast.error(`Invalid IP address for ${plug.name || 'plug'}`);
          continue;
        }
        
        const cleanIp = plug.ip.trim();
        console.log(`Attempting to turn ${action.toUpperCase()} plug: ${plug.name} (${plug.type}) at ${cleanIp}`);
        
        try {
          const result = await window.electronAPI.controlPlug(
            tapoEmailRef.current, 
            tapoPasswordRef.current, 
            cleanIp, 
            action,
            plug.mac
          );
          if (result.resolved_ip) applyResolvedIp(plug.id, result.resolved_ip);

          console.log(`Control result for ${plug.name}:`, result);
          if (!result.success) {
            toast.error(`Failed to turn ${action} ${plug.name}: ${result.error}`);
          } else {
            toast.success(`Turned ${action.toUpperCase()}: ${plug.name}`);
            newStatus[plug.type ?? 'monitor'] = action === 'on';
          }
        } catch (error) {
          console.error(`Failed to turn ${action} ${plug.name}:`, error);
          toast.error(`Error controlling ${plug.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      setPlugsStatus(newStatus);
      
      // Update command status to executed
      await supabase
        .from('bay_commands')
        .update({ status: 'executed', executed_at: new Date().toISOString() })
        .eq('id', commandId);
    };

    // Subscribe to new commands for this bay
    const commandChannel = supabase
      .channel(`bay-${selectedBay}-commands`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bay_commands',
          filter: `bay_number=eq.${selectedBay}`
        },
        async (payload) => {
          const command = payload.new as { id: string; command: string; status: string };
          console.log('Received admin command:', command);

          if (command.status !== 'pending') {
            console.log('Command already processed, ignoring');
            return;
          }

          // Handle mode commands
          if (command.command === 'auto') {
            console.log('Switching to AUTO mode via command');
            setManualOverride(false);
            updateControlModeInDb(false);
            toast.success('Switched to AUTO mode');
            
            // Resume auto control - calculate if plugs should be on using refs
            const now = new Date();
            const today = format(now, "yyyy-MM-dd");
            const todaysBookings = bookingsRef.current.filter(b => 
              b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending')
            );
            
            let shouldBeOn = false;
            for (const booking of todaysBookings) {
              const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
              const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
              const preStartTime = addMinutes(startTime, -preStartMinutesRef.current);
              
              if (isAfter(now, preStartTime) && isBefore(now, endTime)) {
                shouldBeOn = true;
                break;
              }
            }
            
            if (shouldBeOn) {
              setTimeout(() => executePlugControl('on', command.id), 100);
            } else {
              setTimeout(() => executePlugControl('off', command.id), 100);
            }
            
            // Mark command as executed (mode is synced via real-time from admin)
            await supabase
              .from('bay_commands')
              .update({ status: 'executed', executed_at: new Date().toISOString() })
              .eq('id', command.id);
            return;
          }
          
          if (command.command === 'manual') {
            console.log('Switching to MANUAL mode via command');
            setManualOverride(true);
            updateControlModeInDb(true);
            toast.success('Switched to MANUAL mode');
            
            // Mark command as executed (mode is synced via real-time from admin)
            await supabase
              .from('bay_commands')
              .update({ status: 'executed', executed_at: new Date().toISOString() })
              .eq('id', command.id);
            return;
          }

          // OBS chapter marker (format: "obs_chapter:hole=7")
          if (typeof command.command === 'string' && command.command.startsWith('obs_chapter:')) {
            const holeMatch = command.command.match(/hole=(\d+)/);
            const holeNum = holeMatch ? Number(holeMatch[1]) : null;
            const chapterName = holeNum ? `Hole ${holeNum}` : 'Chapter';
            try {
              const electronApi: any = (window as any).electronAPI;
              if (electronApi?.obsAddChapter) {
                const res = await electronApi.obsAddChapter(chapterName);
                if (res?.success) {
                  console.log(`[OBS] Chapter marker set: ${chapterName}`);
                  // Stamp chapter_marked_at on the corresponding hole
                  if (holeNum && activeBooking?.user_id) {
                    await supabase
                      .from('recording_holes')
                      .update({ chapter_marked_at: new Date().toISOString() })
                      .eq('hole_number', holeNum)
                      .in('recording_session_id',
                        (await supabase
                          .from('recording_sessions')
                          .select('id')
                          .eq('status', 'recording')
                          .eq('bay_number', selectedBay)
                        ).data?.map(r => r.id) ?? []
                      );
                  }
                }
              }
            } catch (e) {
              console.error('[OBS] chapter marker failed:', e);
            }
            await supabase
              .from('bay_commands')
              .update({ status: 'executed', executed_at: new Date().toISOString() })
              .eq('id', command.id);
            return;
          }

          // OBS start recording (format: "obs_start_recording:session_id=<uuid>")
          if (typeof command.command === 'string' && command.command.startsWith('obs_start_recording:')) {
            const sessionId = command.command.split('session_id=')[1];
            try {
              const { data: bayData } = await supabase.from('bays').select('id').eq('bay_number', selectedBay).maybeSingle();
              const { data: dev } = await supabase
                .from('bay_devices')
                .select('obs_ws_url, obs_ws_password')
                .eq('bay_id', bayData?.id ?? '')
                .maybeSingle() as { data: { obs_ws_url?: string | null; obs_ws_password?: string | null } | null };
              const obsUrl = dev?.obs_ws_url || 'ws://127.0.0.1:4455';
              const obsPass = dev?.obs_ws_password || '';
              const electronApi: any = (window as any).electronAPI;
              addLog(`[Highlights] Starting OBS recording for session ${sessionId}`, 'info');
              const startRes = await electronApi?.obsStartRecording?.(obsUrl, obsPass);
              if (!startRes?.success) {
                addLog(`[Highlights] OBS start FAILED: ${startRes?.error ?? 'unknown'}`, 'error');
                await supabase.from('recording_sessions').update({ status: 'error', error_message: startRes?.error ?? 'obs start failed' }).eq('id', sessionId);
              } else {
                // Persist session id, start time AND the booking that owns it so the
                // hard-stop watchdog can kill it when that booking ends / changes hands.
                const owner = activeBookingRef.current;
                (window as any).__activeRecording = {
                  sessionId,
                  startedAtMs: startRes.startedAtMs,
                  bookingId: owner?.id ?? null,
                  userId: owner?.user_id ?? null,
                  bookingEndMs: owner?.booking_date && owner?.end_time
                    ? new Date(`${owner.booking_date}T${owner.end_time}`).getTime()
                    : null,
                };
                addLog(`[Highlights] Recording session ${sessionId} started`, 'success');
              }

            } catch (e) {
              addLog(`[Highlights] Start handler error: ${(e as Error).message}`, 'error');
            }
            await supabase.from('bay_commands').update({ status: 'executed', executed_at: new Date().toISOString() }).eq('id', command.id);
            return;
          }

          // OBS stop recording (format: "obs_stop_recording:session_id=<uuid>")
          if (typeof command.command === 'string' && command.command.startsWith('obs_stop_recording:')) {
            const sessionId = command.command.split('session_id=')[1];
            await finalizeRecording(sessionId, 'sgt scorecard stop command');
            await supabase.from('bay_commands').update({ status: 'executed', executed_at: new Date().toISOString() }).eq('id', command.id);
            return;
          }



          // For on/off commands, also switch to manual mode and update DB.
          // Guard: any unrecognised command must NOT flip the bay into manual mode.
          if (command.command !== 'on' && command.command !== 'off') {
            console.warn(`Unrecognised bay command ignored: ${command.command}`);
            await supabase
              .from('bay_commands')
              .update({ status: 'executed', executed_at: new Date().toISOString() })
              .eq('id', command.id);
            return;
          }

          setManualOverride(true);
          updateControlModeInDb(true);
          
          // Small delay to ensure state is updated
          setTimeout(() => {
            executePlugControl(command.command as 'on' | 'off', command.id);
          }, 100);
        }
      )
      .subscribe((status) => {
        console.log('Admin command subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to admin commands');
        }
      });

    // Polling fallback for commands (in case realtime drops)
    const pollPendingCommands = async () => {
      try {
        const { data: pendingCommands, error } = await supabase
          .from('bay_commands')
          .select('*')
          .eq('bay_number', selectedBay)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(5);

        if (error) {
          console.error('Error polling pending commands:', error);
          return;
        }

        if (pendingCommands && pendingCommands.length > 0) {
          console.log(`Found ${pendingCommands.length} pending command(s) via polling`);
          
          for (const command of pendingCommands) {
            // Check if command is older than 5 seconds (give realtime a chance first)
            const commandAge = Date.now() - new Date(command.created_at).getTime();
            if (commandAge < 5000) {
              console.log('Command too recent, waiting for realtime...');
              continue;
            }

            console.log('Processing pending command via polling:', command);

            // Handle mode commands
            if (command.command === 'auto') {
              console.log('Polling: Switching to AUTO mode');
              setManualOverride(false);
              updateControlModeInDb(false);
              toast.success('Switched to AUTO mode (via polling)');
              
              // Resume auto control
              const now = new Date();
              const today = format(now, "yyyy-MM-dd");
              const todaysBookings = bookingsRef.current.filter(b => 
                b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending')
              );
              
              let shouldBeOn = false;
              for (const booking of todaysBookings) {
                const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
                const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
                const preStartTime = addMinutes(startTime, -preStartMinutesRef.current);
                
                if (isAfter(now, preStartTime) && isBefore(now, endTime)) {
                  shouldBeOn = true;
                  break;
                }
              }
              
              if (shouldBeOn) {
                await executePlugControl('on', command.id);
              } else {
                await executePlugControl('off', command.id);
              }
              
              await supabase
                .from('bay_commands')
                .update({ status: 'executed', executed_at: new Date().toISOString() })
                .eq('id', command.id);
              continue;
            }
            
            if (command.command === 'manual') {
              console.log('Polling: Switching to MANUAL mode');
              setManualOverride(true);
              updateControlModeInDb(true);
              toast.success('Switched to MANUAL mode (via polling)');
              
              await supabase
                .from('bay_commands')
                .update({ status: 'executed', executed_at: new Date().toISOString() })
                .eq('id', command.id);
              continue;
            }

            // ONLY plug on/off commands may force MANUAL mode.
            // OBS / recording / any other command types are handled exclusively by the
            // realtime handler above — polling must never fall through to manual here.
            if (command.command !== 'on' && command.command !== 'off') {
              console.log(`Polling: ignoring non-plug command "${command.command}" (realtime handles it)`);
              continue;
            }

            setManualOverride(true);
            updateControlModeInDb(true);
            await executePlugControl(command.command as 'on' | 'off', command.id);
          }
        }
      } catch (err) {
        console.error('Error in command polling:', err);
      }
    };

    // Poll for pending commands every 10 seconds as fallback
    const pollInterval = setInterval(pollPendingCommands, 10000);
    
    // Also run once on mount to catch any missed commands
    setTimeout(pollPendingCommands, 2000);

    return () => {
      supabase.removeChannel(commandChannel);
      clearInterval(pollInterval);
    };
  }, [selectedBay]);
  // Save plug assignments and discovered plugs to localStorage
  // Only save after initial load to prevent overwriting with empty arrays
  useEffect(() => {
    if (plugAssignmentsLoaded) {
      localStorage.setItem("bayController_bayPlugAssignments", JSON.stringify(bayPlugAssignments));
      localStorage.setItem("bayController_discoveredPlugs", JSON.stringify(discoveredPlugs));
    }
  }, [bayPlugAssignments, discoveredPlugs, plugAssignmentsLoaded]);

  // Save pre-start minutes
  useEffect(() => {
    localStorage.setItem("bayController_preStartMinutes", preStartMinutes.toString());
  }, [preStartMinutes]);

  // Save app launch config and sync to main process for global F10 hotkey
  useEffect(() => {
    localStorage.setItem("bayController_appLaunchConfig", JSON.stringify(appLaunchConfig));
    
    // Sync config to main process for global F10 hotkey
    if (isElectron && window.electronAPI?.setAppLaunchConfig) {
      window.electronAPI.setAppLaunchConfig({
        gsproDisplayLabel: appLaunchConfig.gsproDisplayLabel,
        proteeDisplayLabel: appLaunchConfig.proteeDisplayLabel
      }).catch(err => console.error('Failed to sync app launch config to main process:', err));
    }
  }, [appLaunchConfig, isElectron]);

  // Save notification config
  useEffect(() => {
    localStorage.setItem("bayController_notificationConfig", JSON.stringify(notificationConfig));
  }, [notificationConfig]);

  // Ref to track shown notifications to avoid race conditions with state updates
  const shownNotificationsRef = useRef<Set<string>>(new Set());
  
  // Keep ref in sync with state
  useEffect(() => {
    shownNotificationsRef.current = shownNotifications;
  }, [shownNotifications]);

  // Helper to find the final end time for a customer's consecutive bookings (same customer extending)
  const getFinalEndTimeForCustomer = useCallback((booking: Booking): Date => {
    const today = format(currentTime, "yyyy-MM-dd");
    const todaysBookings = bookings.filter(b => 
      b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending')
    );
    
    let currentEndTime = booking.end_time;
    let nextBooking = todaysBookings.find(b => 
      b.start_time === currentEndTime && 
      b.user_id === booking.user_id
    );
    
    // Walk through consecutive bookings by same customer
    while (nextBooking) {
      currentEndTime = nextBooking.end_time;
      nextBooking = todaysBookings.find(b => 
        b.start_time === currentEndTime && 
        b.user_id === booking.user_id
      );
    }
    
    return parseISO(`${today}T${currentEndTime}`);
  }, [bookings, currentTime]);

  // Helper to get next booking after current one (regardless of customer)
  const getNextBooking = useCallback((currentBookingArg: Booking): Booking | null => {
    const today = format(currentTime, "yyyy-MM-dd");
    const todaysBookings = bookings.filter(b => 
      b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending')
    );
    
    return todaysBookings.find(b => 
      b.start_time === currentBookingArg.end_time
    ) || null;
  }, [bookings, currentTime]);

  // Check for customer notifications based on booking end time
  // For same-customer back-to-back bookings, defer notifications until the FINAL session ends
  useEffect(() => {
    if (!notificationConfig.enabled || !activeBooking || !isElectron) {
      return;
    }

    const checkNotifications = async () => {
      const now = new Date();
      
      // Suppress notifications if a changeover to a DIFFERENT customer is in progress or imminent
      // The changeover sequence already handles the transition - showing end-of-session warnings
      // to the outgoing customer during/after changeover is confusing
      if (changeoverInProgressRef.current) {
        return;
      }
      
      // Also suppress if a different-customer booking is about to start (within 2 minutes)
      // This prevents the "1 min warning" from firing right as the changeover triggers
      const nextBooking = getNextBooking(activeBooking);
      if (nextBooking && nextBooking.user_id !== activeBooking.user_id) {
        const [hours, minutes] = nextBooking.start_time.split(':').map(Number);
        const nextStartTime = new Date(now);
        nextStartTime.setHours(hours, minutes, 0, 0);
        const secondsUntilNextStart = (nextStartTime.getTime() - now.getTime()) / 1000;
        if (secondsUntilNextStart <= 120 && secondsUntilNextStart > -30) {
          console.log(`[Notifications] Suppressed: changeover to ${nextBooking.customer_name} in ${Math.round(secondsUntilNextStart)}s`);
          return;
        }
      }
      
      // Get the FINAL end time (accounts for same-customer back-to-back bookings)
      const finalEndTime = getFinalEndTimeForCustomer(activeBooking);
      const minutesRemaining = (finalEndTime.getTime() - now.getTime()) / (1000 * 60);

      // Check each notification trigger
      for (const notification of notificationConfig.notifications) {
        if (!notification.enabled) continue;

        // Use a key that includes the final end time to handle extending sessions
        const notificationKey = `${activeBooking.user_id}-${format(finalEndTime, 'HH:mm')}-${notification.id}`;
        
        // Use ref to check - this avoids race conditions with state updates
        if (shownNotificationsRef.current.has(notificationKey)) {
          continue; // Already shown, skip
        }
        
        // Check if we should show this notification (within 30 seconds of the trigger time)
        if (minutesRemaining <= notification.minutesBefore && 
            minutesRemaining > notification.minutesBefore - 0.5) {
          
          // Mark as shown IMMEDIATELY in the ref to prevent duplicate triggers
          shownNotificationsRef.current.add(notificationKey);
          
          // Get customer first name from booking
          const firstName = activeBooking.customer_name?.split(' ')[0] || 'Guest';
          const message = notification.message.replace('{firstName}', firstName);
          
          // Show notification popup on configured display using Electron API
          if (window.electronAPI && notificationConfig.displayLabel) {
            try {
              // Always use the public Hub URL — the controller runs inside Electron
              // where window.location.origin is a file:// path that phones can't open.
              const extendUrl = notification.showExtendQr && activeBooking?.id
                ? hubUrl(tenant, `/my-bookings?extend=${activeBooking.id}`)
                : undefined;
              await window.electronAPI.showNotificationPopup(
                message,
                notificationConfig.displayLabel,
                60000, // 1 minute duration
                extendUrl
              );
              console.log(`Showing notification popup: ${notification.id} for customer ${activeBooking.user_id} (final end: ${format(finalEndTime, 'HH:mm')}) on display ${notificationConfig.displayLabel}${extendUrl ? ' [with extend QR]' : ''}`);
            } catch (err) {
              console.error('Failed to show notification popup:', err);
            }
          }
          
          // Also update state for persistence/UI sync
          setShownNotifications(prev => new Set([...prev, notificationKey]));
        }
      }
    };

    // Check every 5 seconds
    const interval = setInterval(checkNotifications, 5000);
    checkNotifications(); // Check immediately

    return () => clearInterval(interval);
  }, [activeBooking, notificationConfig, isElectron, getFinalEndTimeForCustomer, getNextBooking]); // Removed shownNotifications from deps to prevent effect re-runs

  // Reset shown notifications when customer changes (not just booking ID)
  useEffect(() => {
    if (activeBooking) {
      // Clear notifications for different customers only
      setShownNotifications(prev => {
        const currentCustomerNotifications = new Set<string>();
        prev.forEach(key => {
          if (key.startsWith(activeBooking.user_id || '')) {
            currentCustomerNotifications.add(key);
          }
        });
        return currentCustomerNotifications;
      });
    }
  }, [activeBooking?.user_id]);

  // Check for upcoming customer changeover - 1 minute before different customer's booking:
  // 1. Show welcome overlay with new customer's name (masks the screen)
  // 2. Close apps (triggers GSPro baseline settings reset)
  // 3. Relaunch apps behind the welcome screen
  // 4. Welcome screen auto-closes 30 seconds after the new booking starts
  const changeoverInProgressRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!isElectron || !activeBooking || manualOverride) {
      if (!isElectron) console.log('[Changeover] Not running in Electron, skipping');
      if (!activeBooking) console.log('[Changeover] No active booking, skipping');
      if (manualOverride) console.log('[Changeover] Manual mode enabled, skipping');
      return;
    }
    
    const checkChangeover = async () => {
      const now = new Date();
      const today = format(now, "yyyy-MM-dd");
      
      console.log(`[Changeover] Checking changeover at ${format(now, "HH:mm:ss")}, active: ${activeBooking.customer_name} (${activeBooking.start_time}-${activeBooking.end_time})`);
      
      const nextBooking = getNextBooking(activeBooking);
      if (!nextBooking) {
        console.log(`[Changeover] No next booking found after ${activeBooking.end_time}`);
        return;
      }
      
      console.log(`[Changeover] Found next booking: ${nextBooking.customer_name} at ${nextBooking.start_time}`);
      
      // Only proceed if it's a DIFFERENT customer (back-to-back with same customer doesn't need reset)
      if (nextBooking.user_id === activeBooking.user_id) {
        console.log(`[Changeover] Same customer booking, skipping changeover`);
        return;
      }
      
      const nextStartTime = parseISO(`${today}T${nextBooking.start_time}`);
      const secondsUntilNextStart = (nextStartTime.getTime() - now.getTime()) / 1000;
      
      console.log(`[Changeover] Seconds until next start: ${secondsUntilNextStart.toFixed(0)}s (trigger window: 60s to -5s)`);
      
      // Trigger 60 seconds before the next booking starts (T-1m)
      if (secondsUntilNextStart <= 60 && secondsUntilNextStart > -5) {
        const changeoverKey = `${activeBooking.id}-${nextBooking.id}`;
        
        // Prevent duplicate changeover sequences
        if (shownChangeoverWelcomes.has(changeoverKey)) {
          console.log(`[Changeover] Already shown for this pair, skipping`);
          return;
        }
        if (changeoverInProgressRef.current === changeoverKey) {
          console.log(`[Changeover] Already in progress, skipping`);
          return;
        }
        
        changeoverInProgressRef.current = changeoverKey;
        setShownChangeoverWelcomes(prev => new Set([...prev, changeoverKey]));

        // Failsafe: ensure changeover state cannot block automation indefinitely
        setTimeout(() => {
          if (changeoverInProgressRef.current === changeoverKey) {
            console.warn('[Changeover] Failsafe clearing stuck changeover flag:', changeoverKey);
            bayLogger.logError('[Changeover] Failsafe cleared stuck changeover flag', undefined, activeBooking.id);
            changeoverInProgressRef.current = null;
          }
        }, 120000);
        const firstName = nextBooking.customer_name?.split(' ')[0] || 'Guest';
        
        console.log(`[BayController] Back-to-back changeover: ${activeBooking.customer_name} -> ${nextBooking.customer_name}`);
        console.log(`[BayController] Starting changeover sequence at T-${Math.round(secondsUntilNextStart)}s`);
        
        if (window.electronAPI) {
          try {
            // Step 1: Show welcome overlay immediately (masks the screen for current customer)
            console.log(`[Changeover] Step 1: Showing welcome screen for ${firstName}`);
            const welcomeResult = await window.electronAPI.showWelcomeWindows(firstName);
            console.log(`[Changeover] Welcome screen result:`, welcomeResult);
            bayLogger.sendLog('automation_decision', `[Changeover Step 1] Welcome screen shown: ${JSON.stringify(welcomeResult)}`, { bookingId: activeBooking.id });
            
            // Step 2: Close apps (triggers GSPro baseline reset in electron main.js)
            if (appsRunning) {
              console.log(`[Changeover] Step 2: Closing apps to trigger baseline reset`);
              bayLogger.sendLog('automation_decision', '[Changeover Step 2] Closing apps for baseline reset', { bookingId: activeBooking.id });
              // Set flag to prevent "unexpected close" log from onGsproClosed listener
              intentionalCloseInProgressRef.current = true;
              lastIntentionalAppCloseAtRef.current = Date.now();
              const closeResult = await window.electronAPI.closeApps(["GSPro.exe", "ProteeLabs.exe"]);
              
              // Log post-close verification
              if (closeResult.stillRunning && closeResult.stillRunning.length > 0) {
                const stillAlive = closeResult.stillRunning.map((p: any) => `${p.name} (PID ${p.pid})`).join(', ');
                bayLogger.sendLog('process_detection', `[Changeover Step 2] Post-close: STILL RUNNING - ${stillAlive}`, {
                  level: 'warning',
                  details: { stillRunning: closeResult.stillRunning },
                  bookingId: activeBooking.id,
                });
              } else {
                bayLogger.sendLog('process_detection', '[Changeover Step 2] Post-close: all processes confirmed dead', {
                  bookingId: activeBooking.id,
                });
              }
              
              setAppsRunning(false);
              setAppLaunchStatus(null);
              bayLogger.logAppClose('GSPro', 'scheduled', activeBooking.id);
              bayLogger.logAppClose('Protee Labs', 'scheduled', activeBooking.id);
              // Clear flag after a short delay to allow GSPro close event to be processed
              setTimeout(() => { intentionalCloseInProgressRef.current = false; }, 2000);
            } else {
              console.log(`[Changeover] Step 2: Apps not running, skipping close`);
            }

            // NOTE: Outgoing customer's snapshot was already captured at their
            // T-3min-before-end timer. No sync needed at changeover time.


            // Step 3: Wait a moment for close to settle, then relaunch apps
            setTimeout(async () => {
              console.log(`[Changeover] Step 3: Relaunching apps behind welcome screen`);
              bayLogger.sendLog('automation_decision', '[Changeover Step 3] Relaunching apps', { bookingId: activeBooking.id });
              // Apps will launch using the standard sequence
              if (appLaunchConfig.enabled && window.electronAPI) {
                setIsLaunchingApps(true);
                setAppLaunchStatus("Relaunching apps for new session...");
                
                try {
                  console.log(`[Changeover] Launching apps with display labels: GSPro="${appLaunchConfig.gsproDisplayLabel}", Protee="${appLaunchConfig.proteeDisplayLabel}"`);

                  // App Restore chain for INCOMING customer (gated by master toggle).
                  // Snapshot first; fall back to baseline if none exists.
                  try {
                    const cfg = await window.electronAPI.getBaselineConfig();
                    if (!cfg?.enabled) {
                      addLog('[Changeover Settings] App Restore disabled — skipping', 'info');
                      bayLogger.sendLog('automation_decision', '[Changeover Settings] App Restore disabled — skipping', { bookingId: nextBooking.id });
                    } else {
                      let restoredCount = 0;
                      if (nextBooking.user_id) {
                        try {
                          bayLogger.sendLog('automation_decision', `[Changeover Settings] Restoring snapshot for user ${nextBooking.user_id}`, { bookingId: nextBooking.id });
                          const restored = await restoreUserGsproSettings(nextBooking.user_id, {
                            bayNumber: selectedBay,
                            bookingId: nextBooking.id,
                            appVersion,
                          });
                          restoredCount = restored.restored.length;
                          if (restoredCount) {
                            const msg = `[Changeover Settings] Restored ${firstName}'s GSPro snapshot: ${restored.restored.join(', ')}`;
                            addLog(msg, 'info');
                            bayLogger.sendLog('automation_decision', msg, { bookingId: nextBooking.id });
                          } else {
                            const msg = `[Changeover Settings] No snapshot for ${firstName}${restored.error ? ` (error: ${restored.error})` : ''} — falling back to baseline`;
                            addLog(msg, 'info');
                            bayLogger.sendLog('automation_decision', msg, { bookingId: nextBooking.id, level: restored.error ? 'warning' : 'info' });
                          }
                        } catch (e) {
                          console.error('[Changeover] restoreUserGsproSettings failed:', e);
                          bayLogger.logError('[Changeover Settings] Restore exception — will fall back to baseline', e, nextBooking.id);
                        }
                      }

                      if (restoredCount === 0) {
                        try {
                          const baseline = await window.electronAPI.restoreBaselineNow();
                          if (baseline?.success) {
                            const ok = (baseline.results || []).filter((r: any) => r.success).map((r: any) => r.file);
                            const msg = ok.length
                              ? `[Changeover Settings] Applied baseline fallback: ${ok.join(', ')}`
                              : `[Changeover Settings] Baseline fallback returned no files`;
                            addLog(msg, 'info');
                            bayLogger.sendLog('automation_decision', msg, { bookingId: nextBooking.id });
                          }
                        } catch (e) {
                          console.error('[Changeover] baseline fallback failed:', e);
                          bayLogger.logError('[Changeover Settings] Baseline fallback exception', e, nextBooking.id);
                        }
                      }
                    }
                  } catch (e) {
                    console.error('[Changeover] App Restore chain failed:', e);
                    bayLogger.logError('[Changeover Settings] App Restore chain exception', e, nextBooking.id);
                  }


                  const result = await window.electronAPI.runAppSequence({
                    gsproPath: appLaunchConfig.gsproPath,
                    proteeLabsPath: appLaunchConfig.proteeLabsPath,
                    gsproDisplay: 0, // Legacy fallback
                    proteeDisplay: 0, // Legacy fallback
                    gsproDisplayLabel: appLaunchConfig.gsproDisplayLabel,
                    proteeDisplayLabel: appLaunchConfig.proteeDisplayLabel,
                    postLaunchDelay: 3000,
                    firstName: firstName,
                  });
                  
                  // Log display snapshot from electron for diagnostics
                  if (result.displaySnapshot) {
                    const displayLabels = result.displaySnapshot.map((d: any) => `${d.label} (${d.size.width}x${d.size.height})`).join(', ');
                    bayLogger.sendLog('automation_decision', `[Changeover Step 3] Display snapshot: ${displayLabels}`, {
                      details: { displays: result.displaySnapshot, gsproTarget: appLaunchConfig.gsproDisplayLabel, proteeTarget: appLaunchConfig.proteeDisplayLabel },
                      bookingId: activeBooking.id,
                    });
                  }
                  
                  if (result.success) {
                    setAppsRunning(true);
                    setAppLaunchStatus("Apps ready for new session");
                    console.log(`[Changeover] Step 3: Apps relaunched successfully`);
                    bayLogger.sendLog('automation_decision', '[Changeover Step 3] Apps relaunched successfully', { bookingId: activeBooking.id });
                  } else {
                    console.error(`[Changeover] Step 3: App relaunch failed:`, result.error);
                    setAppLaunchStatus(`Relaunch failed: ${result.error} (will auto-retry)`);
                    bayLogger.sendLog('automation_decision', `[Changeover Step 3 FAILED] App relaunch error: ${result.error}`, { bookingId: activeBooking.id });
                    bayLogger.logError(`[Changeover Step 3] App relaunch failed: ${result.error}`, undefined, activeBooking.id);
                  }
                } catch (err) {
                  console.error(`[Changeover] Step 3: App relaunch error:`, err);
                  bayLogger.logError(`[Changeover Step 3] App relaunch exception`, err, activeBooking.id);
                } finally {
                  setIsLaunchingApps(false);
                }
              } else {
                console.log(`[Changeover] Step 3: App launch disabled or API unavailable`);
              }
            }, 3000); // 3 second delay for baseline restore
            
            // Step 4: Close welcome screen 30 seconds AFTER the new booking starts
            const msUntilNextStart = nextStartTime.getTime() - now.getTime();
            const closeWelcomeDelay = Math.max(msUntilNextStart + 30000, 30000); // At least 30s from now
            
            setTimeout(async () => {
              console.log(`[Changeover] Step 4: Closing welcome screen after ${closeWelcomeDelay}ms`);
              bayLogger.sendLog('automation_decision', '[Changeover Step 4] Closing welcome screen', { bookingId: activeBooking.id });
              await window.electronAPI?.closeWelcomeWindows();
              changeoverInProgressRef.current = null;
            }, closeWelcomeDelay);
            
          } catch (err) {
            console.error(`[Changeover] Error during changeover sequence:`, err);
            bayLogger.logError(`[Changeover] Sequence error`, err, activeBooking.id);
            changeoverInProgressRef.current = null;
          }
        } else {
          console.log(`[Changeover] Electron API not available`);
        }
      }
    };
    
    const interval = setInterval(checkChangeover, 5000);
    checkChangeover();
    
    return () => clearInterval(interval);
  }, [activeBooking, appsRunning, isElectron, manualOverride, shownChangeoverWelcomes, getNextBooking, appLaunchConfig, runSwingLabCloseSync, bayLogger]);

  // Helper function to calculate if plugs should be on based on bookings
  const calculateShouldPlugsBeOn = useCallback(() => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    // Include both confirmed AND pending bookings for plug control
    const todaysBookings = bookings.filter(b => b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending'));
    
    console.log(`[calculateShouldPlugsBeOn] Now: ${format(now, "HH:mm:ss")}, Today: ${today}, Bookings today: ${todaysBookings.length}`);
    
    let shouldBeOn = false;
    let currentBooking: Booking | null = null;

    for (const booking of todaysBookings) {
      const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
      const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
      const preStartTime = addMinutes(startTime, -preStartMinutes);

      const isAfterPreStart = isAfter(now, preStartTime);
      const isBeforeEnd = isBefore(now, endTime);
      const isAfterStart = isAfter(now, startTime) || now.getTime() === startTime.getTime();
      
      console.log(`[calculateShouldPlugsBeOn] Checking booking ${booking.start_time}-${booking.end_time}: preStart=${format(preStartTime, "HH:mm:ss")}, isAfterPreStart=${isAfterPreStart}, isBeforeEnd=${isBeforeEnd}, isAfterStart=${isAfterStart}`);

      if (isAfterPreStart && isBeforeEnd) {
        shouldBeOn = true;
        // For activeBooking assignment: prefer the booking that has actually STARTED
        // over one that is only in its pre-start window. This ensures during B2B overlap
        // (current booking still running, next booking's pre-start has begun),
        // we keep the CURRENT booking as active so changeover logic can detect the transition.
        if (isAfterStart) {
          // This booking has actually started - it takes priority
          currentBooking = booking;
          console.log(`[calculateShouldPlugsBeOn] -> ACTIVE booking found (started)!`);
        } else if (!currentBooking) {
          // Only in pre-start window, and no other booking has started yet
          currentBooking = booking;
          console.log(`[calculateShouldPlugsBeOn] -> PRE-START booking found (no active yet)!`);
        } else {
          console.log(`[calculateShouldPlugsBeOn] -> PRE-START booking found but another is still active, keeping current`);
        }
      }

      // Check for back-to-back bookings
      const nextBooking = todaysBookings.find(b => 
        b.id !== booking.id && 
        b.start_time === booking.end_time
      );
      
      if (nextBooking && isAfterPreStart) {
        const nextEndTime = parseISO(`${nextBooking.booking_date}T${nextBooking.end_time}`);
        if (isBefore(now, nextEndTime)) {
          shouldBeOn = true;
        }
      }
    }

    console.log(`[calculateShouldPlugsBeOn] Result: shouldBeOn=${shouldBeOn}, currentBooking=${currentBooking?.id || 'none'}`);
    return { shouldBeOn, currentBooking };
  }, [bookings, preStartMinutes]);

  // Track previous bookings to detect cancellations
  const previousBookingsRef = useRef<Booking[]>([]);

  // Check for active booking and manage plugs
  useEffect(() => {
    const now = currentTime;
    const today = format(now, "yyyy-MM-dd");
    // Include both confirmed AND pending bookings for active booking detection and plug control
    const todaysBookings = bookings.filter(b => b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending'));
    
    const { shouldBeOn, currentBooking } = calculateShouldPlugsBeOn();

    setActiveBooking(currentBooking);

    // Detect if a booking was cancelled/removed
    const prevBookingIds = previousBookingsRef.current.map(b => b.id);
    const currentBookingIds = bookings.map(b => b.id);
    const removedBookings = prevBookingIds.filter(id => !currentBookingIds.includes(id));
    
    if (removedBookings.length > 0) {
      console.log('Booking(s) removed/cancelled:', removedBookings);
      
      // Check if ANY of the removed bookings was an active/current booking (not a future one)
      // An active booking is one that was controlling the plugs (within pre-start to end time)
      const removedActiveBookings = previousBookingsRef.current.filter(b => {
        if (!removedBookings.includes(b.id)) return false;
        if (b.booking_date !== today) return false;
        
        const startTime = parseISO(`${b.booking_date}T${b.start_time}`);
        const endTime = parseISO(`${b.booking_date}T${b.end_time}`);
        const preStartTime = addMinutes(startTime, -preStartMinutes);
        
        // Was this booking currently active (within pre-start to end)?
        return isAfter(now, preStartTime) && isBefore(now, endTime);
      });
      
      // Only turn off plugs if an ACTIVE booking was cancelled AND manual override is not on
      if (removedActiveBookings.length > 0 && !manualOverride) {
        console.log('Active booking(s) cancelled - checking if plugs should turn off');
        if (!shouldBeOn && (plugsStatus.monitor || plugsStatus.projector)) {
          console.log('No other active bookings - turning off plugs');
          turnOffPlugs(false, false);
        }
      } else if (removedBookings.length > 0) {
        console.log('Cancelled booking was in the future, not affecting plugs');
      }
    }
    
    // Update previous bookings ref
    previousBookingsRef.current = [...bookings];

    // SAFETY NET: If plugs are on but no booking window justifies it (and not manual),
    // turn them off. This catches reschedules-away (booking ID stays but times move),
    // which the cancellation detector above misses, and the PrecisionScheduler can
    // miss when its timers were cleared mid-flight by a bookings refresh.
    if (
      !manualOverride &&
      !shouldBeOn &&
      (plugsStatus.monitor || plugsStatus.projector) &&
      !isLaunchingApps
    ) {
      console.log('[SafetyNet] Plugs on but no active booking window - turning off');
      bayLogger.sendLog('automation_decision',
        '[SafetyNet] Plugs on without active booking - turning off (likely reschedule)',
        { immediate: true }
      );
      turnOffPlugs(false, false);
    }

    // NOTE: Plug on/off is handled by the PrecisionScheduler (below) plus the safety net above.
    // Legacy warning notifications are handled by the dedicated notification effect (N1).
  }, [currentTime, bookings, preStartMinutes, manualOverride, calculateShouldPlugsBeOn, plugsStatus.monitor, plugsStatus.projector, isLaunchingApps, bayLogger]);

  // PRECISION SCHEDULER: Schedule exact timeouts for upcoming booking transitions
  // This uses a DUAL-TIMER approach:
  //   1. App close at T-appCloseSeconds (e.g. T-15s), kills apps while screens are still on
  //   2. Plug off at T+0, cuts power after apps are confirmed dead
  // This ensures apps are fully terminated before plugs turn off, preventing orphaned processes.
  const scheduledTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  
  useEffect(() => {
    if (manualOverride || !isElectron) return;
    
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const todaysBookings = bookings.filter(b => 
      b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending')
    );
    
    // Clear old timeouts that are no longer relevant
    scheduledTimeoutsRef.current.forEach((timeout, key) => {
      const [bookingId] = key.split('-');
      if (!todaysBookings.find(b => b.id === bookingId)) {
        clearTimeout(timeout);
        scheduledTimeoutsRef.current.delete(key);
      }
    });
    
    // COLD-START CATCH-UP: If the app just started (or was reinstalled) during an active
    // booking window, the pre-start time is already past so no timeout will be scheduled.
    // Detect this and immediately turn plugs on.
    const coldStartCatchUpKey = '__coldstart_catchup';
    if (!scheduledTimeoutsRef.current.has(coldStartCatchUpKey)) {
      const activeNow = todaysBookings.find(b => {
        const st = parseISO(`${b.booking_date}T${b.start_time}`);
        const et = parseISO(`${b.booking_date}T${b.end_time}`);
        const preSt = addMinutes(st, -preStartMinutes);
        return isAfter(now, preSt) && isBefore(now, et);
      });
      if (activeNow && !plugsStatus.monitor && !plugsStatus.projector) {
        console.log(`[PrecisionScheduler] COLD-START CATCH-UP: Active booking ${activeNow.id} detected, turning plugs ON immediately`);
        bayLogger.sendLog('automation_decision', `[PrecisionScheduler] Cold-start catch-up: plugs ON for active booking`, {
          bookingId: activeNow.id,
          immediate: true,
        });
        turnOnPlugs(false, false);
        // Mark so we don't re-trigger on every render
        const marker = setTimeout(() => {}, 0);
        scheduledTimeoutsRef.current.set(coldStartCatchUpKey, marker);
      }
    }

    // Schedule precise timeouts for each booking transition
    for (const booking of todaysBookings) {
      const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
      const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
      const preStartTime = addMinutes(startTime, -preStartMinutes);
      
      // Schedule plug ON at pre-start time
      const preStartKey = `${booking.id}-prestart`;
      const msUntilPreStart = preStartTime.getTime() - now.getTime();
      
      if (msUntilPreStart > 0 && msUntilPreStart < 300000 && !scheduledTimeoutsRef.current.has(preStartKey)) {
        console.log(`[PrecisionScheduler] Scheduling plug ON for booking ${booking.id} in ${Math.round(msUntilPreStart / 1000)}s`);
        const timeout = setTimeout(() => {
          console.log(`[PrecisionScheduler] EXECUTING: Turning ON plugs for booking ${booking.id}`);
          if (!manualOverride) {
            turnOnPlugs(false, false);
          }
          scheduledTimeoutsRef.current.delete(preStartKey);
        }, msUntilPreStart);
        scheduledTimeoutsRef.current.set(preStartKey, timeout);
      }
      
      // Determine if there's a back-to-back booking after this one
      const hasNextBooking = todaysBookings.some(b => 
        b.id !== booking.id && b.start_time === booking.end_time
      );
      
      // For same-customer B2B, find the FINAL end time in the chain
      // This prevents early app-close when the same customer has consecutive sessions
      const isSameCustomerNext = hasNextBooking && todaysBookings.some(b => 
        b.id !== booking.id && b.start_time === booking.end_time && b.user_id === booking.user_id
      );
      
      // Different-customer B2B: changeover effect handles app close/relaunch at T-60s
      // So we skip BOTH app-close and plug-off timers for this booking
      const isDiffCustomerNext = hasNextBooking && !isSameCustomerNext;
      
      if (!hasNextBooking) {
        // --- TIMER 1: APP CLOSE at T-appCloseSeconds ---
        // Close apps while screens are still powered on
        const appCloseTime = new Date(endTime.getTime() - (appLaunchConfig.appCloseSeconds * 1000));
        const appCloseKey = `${booking.id}-appclose`;
        const msUntilAppClose = appCloseTime.getTime() - now.getTime();
        
        if (msUntilAppClose > 0 && msUntilAppClose < 300000 && !scheduledTimeoutsRef.current.has(appCloseKey)) {
          console.log(`[PrecisionScheduler] Scheduling APP CLOSE for booking ${booking.id} in ${Math.round(msUntilAppClose / 1000)}s (T-${appLaunchConfig.appCloseSeconds}s)`);
          const timeout = setTimeout(async () => {
            console.log(`[PrecisionScheduler] EXECUTING: Closing apps ${appLaunchConfig.appCloseSeconds}s before booking ${booking.id} ends`);
            
            // Just-in-time validation: re-check bookings to see if session was extended
            const currentBookings = bookingsRef.current;
            const stillLastBooking = !currentBookings.some(b => 
              b.id !== booking.id && b.start_time === booking.end_time && 
              b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending')
            );
            
            if (!stillLastBooking) {
              console.log(`[PrecisionScheduler] App close SKIPPED - booking ${booking.id} now has a follow-up booking`);
              bayLogger.sendLog('automation_decision', `[PrecisionScheduler] App close skipped - session extended or B2B added`, {
                bookingId: booking.id,
              });
              scheduledTimeoutsRef.current.delete(appCloseKey);
              return;
            }
            
            if (!manualOverride && appsRunning && appLaunchConfig.enabled) {
              bayLogger.sendLog('automation_decision', `[PrecisionScheduler] Closing apps at T-${appLaunchConfig.appCloseSeconds}s (before plug-off)`, {
                bookingId: booking.id,
                immediate: true,
              });
              intentionalCloseInProgressRef.current = true;
              lastIntentionalAppCloseAtRef.current = Date.now();
              await closeApps('scheduled');
              setTimeout(() => { intentionalCloseInProgressRef.current = false; }, 2000);
            }
            scheduledTimeoutsRef.current.delete(appCloseKey);
          }, msUntilAppClose);
          scheduledTimeoutsRef.current.set(appCloseKey, timeout);
        }
        
        // --- TIMER 2: PLUG OFF at T+0 ---
        // Cut power - apps should already be dead from Timer 1
        const endKey = `${booking.id}-end`;
        const msUntilEnd = endTime.getTime() - now.getTime();
        
        if (msUntilEnd > 0 && msUntilEnd < 300000 && !scheduledTimeoutsRef.current.has(endKey)) {
          console.log(`[PrecisionScheduler] Scheduling plug OFF for booking ${booking.id} in ${Math.round(msUntilEnd / 1000)}s (T+0)`);
          const timeout = setTimeout(() => {
            console.log(`[PrecisionScheduler] EXECUTING: Turning OFF plugs after booking ${booking.id} (apps should already be closed)`);
            if (!manualOverride) {
              turnOffPlugs(false, false);
            }
            scheduledTimeoutsRef.current.delete(endKey);
          }, msUntilEnd);
          scheduledTimeoutsRef.current.set(endKey, timeout);
        }
      } else if (isSameCustomerNext) {
        // Same customer B2B: no app-close, no plug-off - apps keep running
        console.log(`[PrecisionScheduler] Skipping end timers for booking ${booking.id} - same customer B2B`);
      } else if (isDiffCustomerNext) {
        // Different customer B2B: changeover effect handles app close at T-60s, no plug-off needed
        console.log(`[PrecisionScheduler] Skipping end timers for booking ${booking.id} - different customer B2B (changeover handles it)`);
      }
    }
    
    // Cleanup function to clear all timeouts when component unmounts or deps change.
    // CRITICAL: Also clear the Map so that on the next effect run, .has(key) is false
    // and the timers get re-armed against the latest booking times. Otherwise a
    // reschedule mid-flight wipes the timer handles but leaves stale Map keys,
    // preventing re-scheduling (this was the Chelsea-bay-4 bug).
    return () => {
      scheduledTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      scheduledTimeoutsRef.current.clear();
    };
  }, [bookings, preStartMinutes, manualOverride, isElectron, appLaunchConfig.appCloseSeconds, appLaunchConfig.enabled, plugsStatus.monitor, plugsStatus.projector]);

  const resumeAuto = useCallback(async () => {
    console.log('Resuming auto control...');
    console.log('Current bookings count:', bookings.length);
    console.log('Active booking:', activeBooking ? `${activeBooking.customer_name} (${activeBooking.start_time}-${activeBooking.end_time})` : 'none');
    
    // CRITICAL: Check plug state BEFORE flipping manualOverride to false.
    // If plugs should be off, set the intentional-close cooldown first so
    // the auto-launch effect doesn't race and launch apps in the brief window
    // between manualOverride=false and plugs actually turning off.
    const { shouldBeOn, currentBooking } = calculateShouldPlugsBeOn();
    console.log('Current booking state - should plugs be on:', shouldBeOn);
    console.log('Found current booking:', currentBooking ? `${currentBooking.customer_name} (${currentBooking.start_time}-${currentBooking.end_time})` : 'none');
    
    if (!shouldBeOn) {
      // Pre-set the cooldown to block the auto-launch effect from firing
      // during the manual→auto transition when no booking is active
      lastIntentionalAppCloseAtRef.current = Date.now();
      console.log('Auto mode: pre-setting intentional close cooldown to block phantom launches');
    }
    
    setManualOverride(false);
    bayLogger.logManualOverride(false);
    
    // Sync mode to database
    await updateControlMode(false);
    
    if (shouldBeOn) {
      console.log('Auto mode: turning ON plugs');
      turnOnPlugs(false, true); // Auto control, show toast
    } else {
      console.log('Auto mode: turning OFF plugs - no active booking in window');
      turnOffPlugs(false, true); // Auto control, show toast
    }
  }, [calculateShouldPlugsBeOn, updateControlMode, bookings.length, activeBooking, bayLogger]);

  // Toggle to manual mode - syncs to database and enables manual control
  const setToManualMode = useCallback(async () => {
    console.log('Switching to manual control...');
    setManualOverride(true);
    await updateControlMode(true);
    bayLogger.logManualOverride(true);
    toast.success('Switched to MANUAL mode');
  }, [updateControlMode, bayLogger]);

  // Save TAPO credentials whenever they change
  useEffect(() => {
    if (tapoEmail) {
      localStorage.setItem("bayController_tapoEmail", tapoEmail);
    }
    if (tapoPassword) {
      localStorage.setItem("bayController_tapoPassword", tapoPassword);
    }
  }, [tapoEmail, tapoPassword]);

  // Persist appsRunning state so auto-close works after page refresh
  useEffect(() => {
    localStorage.setItem("bayController_appsRunning", appsRunning.toString());
  }, [appsRunning]);

  // PROCESS DETECTION: Detect externally-launched GSPro/Protee Labs and sync appsRunning state
  // This ensures auto-close works even when staff launch apps manually outside the controller
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.findWindow || !appLaunchConfig.enabled) return;
    // Don't detect while we're in the middle of launching apps ourselves
    if (isLaunchingApps) return;

    const checkInterval = setInterval(async () => {
      // Only detect externally launched apps when we think apps are NOT running
      // If appsRunning is already true, the controller is already tracking them
      if (appsRunning) return;

      try {
        const [gsproResult, proteeResult] = await Promise.all([
          window.electronAPI!.findWindow("GSPro").catch(() => ({ found: false })),
          window.electronAPI!.findWindow("ProTee").catch(() => ({ found: false })),
        ]);

        const gsproFound = !!(gsproResult as any)?.found;
        const proteeFound = !!(proteeResult as any)?.found;

        if (gsproFound || proteeFound) {
          const detectedApps = [gsproFound && "GSPro", proteeFound && "Protee Labs"].filter(Boolean).join(" & ");
          console.log(`[ProcessDetection] Externally launched app(s) detected: ${detectedApps}, setting appsRunning=true`);
          addLog(`Detected externally launched: ${detectedApps}`, 'info');
          bayLogger.sendLog('process_detection', `Externally launched app(s) detected: ${detectedApps}`, {
            details: { gsproFound, proteeFound },
            bookingId: activeBooking?.id,
          });
          setAppsRunning(true);
          setAppLaunchStatus(`${detectedApps} detected (external launch)`);
        }
      } catch (err) {
        // Silent failure, don't spam logs
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(checkInterval);
  }, [isElectron, appsRunning, appLaunchConfig.enabled, isLaunchingApps, activeBooking?.id, addLog, bayLogger]);

  // Fallback close detection for Swing Lab sync. The Electron main process sends a
  // gspro-closed event, but this renderer poll means CSV upload still runs if that
  // event is missed or the baseline watcher was previously disabled.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.isGsproRunning) return;

    let cancelled = false;
    const pollGspro = async () => {
      try {
        const result = await window.electronAPI!.isGsproRunning();
        if (cancelled) return;
        const isRunning = !!result?.isRunning;
        const wasRunning = lastGsproRunningRef.current;

        if (wasRunning === null) {
          lastGsproRunningRef.current = isRunning;
          return;
        }

        if (wasRunning && !isRunning) {
          addLog('[Sync] Renderer polling detected GSPro closed', 'info');
          bayLogger.sendLog('automation_decision', '[Sync] Renderer polling detected GSPro closed', {
            bookingId: activeBooking?.id,
            immediate: true,
          });
          runSwingLabCloseSync('renderer polling');
        }

        lastGsproRunningRef.current = isRunning;
      } catch {
        // Keep silent so this does not spam the bay controller log if Windows process lookup fails briefly.
      }
    };

    pollGspro();
    const interval = setInterval(pollGspro, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isElectron, activeBooking?.id, addLog, bayLogger, runSwingLabCloseSync]);

  // NOTE: Mid-session settings capture was intentionally removed.
  // GSPro's "Save & Exit" also writes settings to disk, and capturing early
  // (e.g. before the user has entered their SGT ID) would overwrite the stored
  // snapshot with a guest/default roster. Capture now happens ONLY on GSPro
  // close (via the gspro-closed IPC + the 3s renderer poll fallback), which
  // guarantees we grab the latest state after the user has finished editing.

  // Keep a ref to the latest activeBooking so the Desktop CSV watcher listener
  // (subscribed once below) always sees current context.
  useEffect(() => {
    activeBookingRef.current = activeBooking ?? null;
  }, [activeBooking]);

  // ── HARD STOP WATCHDOG ─────────────────────────────────────────────────────
  // A recording must NEVER outlive the booking that started it, and it must be
  // fully stopped + uploaded BEFORE the bay powers down at T+0. Checks every 5s
  // and force-stops + uploads if:
  //   1. we're within 2 minutes of (or past) the owning booking's end time, or
  //   2. the bay has changed hands (back-to-back with a different customer), or
  //   3. the owning booking has vanished (cancelled / rescheduled / deleted).
  useEffect(() => {
    if (!isElectron || !selectedBay) return;

    const interval = setInterval(() => {
      const rec = (window as any).__activeRecording;
      if (!rec?.sessionId) return;

      const now = Date.now();
      const current = activeBookingRef.current;
      let reason: string | null = null;

      if (rec.bookingEndMs && now >= rec.bookingEndMs - 120_000) {
        reason = 'booking end approaching (T-2m)';

      } else if (rec.bookingId && current && current.id !== rec.bookingId) {
        reason = current.user_id !== rec.userId
          ? 'bay changed hands (different customer)'
          : 'booking changed';
      } else if (rec.bookingId && !current) {
        reason = 'owning booking no longer active';
      } else if (rec.bookingId && !bookingsRef.current.some(b => b.id === rec.bookingId)) {
        reason = 'owning booking removed';
      }

      if (reason) {
        addLog(`[Highlights] Hard stop triggered: ${reason}`, 'info');
        bayLogger.sendLog('automation_decision', `[Highlights] Hard stop recording ${rec.sessionId}: ${reason}`, {
          bookingId: rec.bookingId ?? undefined,
        });
        void finalizeRecording(rec.sessionId, `hard stop — ${reason}`);
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [isElectron, selectedBay, addLog, bayLogger, finalizeRecording]);



  // Desktop CSV watcher: main process pushes each newly-written GSPro export.
  // We attribute it to whichever booking is active RIGHT NOW (at write time)
  // and upload immediately. Deletion happens inside uploadRangeCsv on success.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onDesktopCsvDetected) return;

    const cleanup = window.electronAPI.onDesktopCsvDetected(async (payload) => {
      const booking = activeBookingRef.current;
      const userId = booking?.user_id;

      addLog(`[CSV-Watch] Detected ${payload.filename} (${Math.round(payload.size / 1024)} KB). Active booking user=${userId ?? 'none'}`, 'info');
      bayLogger.sendLog('automation_decision', `[CSV-Watch] Detected ${payload.filename}`, {
        bookingId: booking?.id,
        immediate: true,
      });

      if (!userId) {
        addLog(`[CSV-Watch] No active booking — leaving ${payload.filename} on Desktop for later`, 'info');
        return;
      }

      const result = await uploadRangeCsv({
        filename: payload.filename,
        base64: payload.base64,
        userId,
        bookingId: booking?.id ?? null,
        bayId: null,
        bayNumber: selectedBay,
        appVersion,
        log: (msg, level) => {
          const mapped: 'info' | 'success' | 'error' = level === 'warning' ? 'info' : (level ?? 'info');
          addLog(msg, mapped);
        },
      });

      bayLogger.sendLog('automation_decision', `[CSV-Watch] Upload ${result.uploaded ? 'OK' : 'FAILED'}: ${payload.filename}`, {
        level: result.uploaded ? 'info' : 'error',
        bookingId: booking?.id,
        immediate: true,
      });
    });

    addLog('[CSV-Watch] Desktop CSV watcher listener attached', 'info');
    return () => { cleanup?.(); };
  }, [isElectron, selectedBay, appVersion, addLog, bayLogger]);


  // Add a plug manually.
  // The IP is only a starting hint: we authenticate to it once and store the
  // burned-in MAC as the plug's identity, so DHCP drift is handled the same way
  // as a plug found by Search. A MAC can also be typed in directly.
  const addPlugManually = async () => {
    if (!newPlugName.trim() || !newPlugIp.trim()) {
      toast.error("Please enter both plug name and IP address");
      return;
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(newPlugIp.trim())) {
      toast.error("Please enter a valid IP address (e.g., 192.168.1.100)");
      return;
    }

    const typedMac = newPlugMac.trim();
    if (typedMac && !/^([0-9a-fA-F]{2}[:-]?){5}[0-9a-fA-F]{2}$/.test(typedMac)) {
      toast.error("MAC address looks invalid (e.g., 7C-F1-7E-20-CE-1B)");
      return;
    }

    const newPlug: TapoPlug = {
      id: `manual-${Date.now()}`,
      name: newPlugName.trim(),
      ip: newPlugIp.trim(),
      isOn: false,
      mac: typedMac || undefined,
      type: newPlugType,
    };

    // If no MAC was typed, look it up from the plug itself so the binding is
    // MAC-based and survives a lease change.
    if (!typedMac && isElectron && window.electronAPI?.identifyPlug && tapoEmail && tapoPassword) {
      setIsIdentifyingPlug(true);
      try {
        const res = await window.electronAPI.identifyPlug(tapoEmail, tapoPassword, newPlug.ip);
        if (res?.success && res.plug) {
          newPlug.mac = res.plug.mac;
          newPlug.nickname = res.plug.nickname;
          newPlug.model = res.plug.model;
          newPlug.firmware = res.plug.firmware;
          newPlug.firmwareRisk = res.plug.firmware_risk;
          newPlug.deviceId = res.plug.device_id;
          newPlug.isOn = !!res.plug.isOn;
          if (res.plug.mac_key) newPlug.id = res.plug.mac_key;
        } else {
          toast.warning(
            `Couldn't reach a plug at ${newPlug.ip} to read its MAC — added by IP only, so it won't survive an IP change.`,
          );
        }
      } catch {
        toast.warning("MAC lookup failed — plug added by IP only.");
      } finally {
        setIsIdentifyingPlug(false);
      }
    }

    setDiscoveredPlugs(prev => {
      const updated = [...prev.filter(p => p.id !== newPlug.id), newPlug];
      // Save to localStorage immediately
      localStorage.setItem("bayController_discoveredPlugs", JSON.stringify(updated));
      return updated;
    });
    setNewPlugName("");
    setNewPlugIp("");
    setNewPlugMac("");
    setNewPlugType(undefined);
    toast.success(
      newPlug.mac ? `Added ${newPlug.name} — bound to MAC ${newPlug.mac}` : `Added ${newPlug.name} (IP only)`,
    );
  };


  // Delete a plug from discovered plugs
  const handleDeletePlug = (plugId: string) => {
    setDiscoveredPlugs(prev => {
      const updated = prev.filter(p => p.id !== plugId);
      localStorage.setItem("bayController_discoveredPlugs", JSON.stringify(updated));
      return updated;
    });
    toast.success("Plug removed");
  };

  /**
   * Search the local network for Tapo plugs and merge them into the plug list.
   * Existing plugs are matched by MAC address, so a plug that changed IP is
   * updated in place (assignments are preserved) rather than duplicated.
   */
  const discoverPlugs = async () => {
    if (!isElectron || !window.electronAPI?.discoverPlugs) {
      toast.error("Plug search requires the desktop app");
      return;
    }
    if (!tapoEmail || !tapoPassword) {
      toast.error("Enter your TAPO email and password first");
      return;
    }

    setIsDiscoveringPlugs(true);
    try {
      const result = await window.electronAPI.discoverPlugs(tapoEmail, tapoPassword);
      if (!result.success) {
        toast.error(result.error || "Plug search failed");
        return;
      }

      const found = result.plugs || [];
      if (found.length === 0) {
        toast.warning("No Tapo plugs found. Check the PC and plugs are on the same network with client isolation off.");
        return;
      }

      const normalize = (mac?: string) => (mac || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
      let added = 0;
      let updated = 0;
      const macToNewIp: Record<string, string> = {};

      setDiscoveredPlugs(prev => {
        const next = [...prev];
        for (const d of found) {
          const key = normalize(d.mac);
          const existingIndex = next.findIndex(p => normalize(p.mac) === key && key !== "");
          if (existingIndex >= 0) {
            const existing = next[existingIndex];
            if (existing.ip !== d.ip) updated++;
            macToNewIp[key] = d.ip;
            next[existingIndex] = {
              ...existing,
              ip: d.ip,
              nickname: d.nickname,
              model: d.model,
              firmware: d.firmware,
              firmwareRisk: d.firmware_risk,
              isOn: !!d.isOn,
            };
          } else {
            added++;
            next.push({
              id: key || `plug-${Date.now()}-${added}`,
              name: d.nickname || d.ip,
              nickname: d.nickname,
              ip: d.ip,
              mac: d.mac,
              model: d.model,
              firmware: d.firmware,
              firmwareRisk: d.firmware_risk,
              isOn: !!d.isOn,
              deviceId: d.device_id,
              // No assumption about what the plug powers — the operator picks
              // Monitor or Projector when assigning it to a bay.
              type: undefined,
            });
          }
        }
        localStorage.setItem("bayController_discoveredPlugs", JSON.stringify(next));
        return next;
      });

      // Keep bay assignments pointing at the current IPs
      if (Object.keys(macToNewIp).length > 0) {
        setBayPlugAssignments(prev => {
          const next = prev.map(a => ({
            ...a,
            plugs: a.plugs.map(p => {
              const newIp = macToNewIp[normalize(p.mac)];
              return newIp ? { ...p, ip: newIp } : p;
            }),
          }));
          localStorage.setItem("bayController_bayPlugAssignments", JSON.stringify(next));
          return next;
        });
      }

      const risky = found.filter(d => d.firmware_risk);
      toast.success(`Found ${found.length} plug(s) — ${added} new, ${updated} IP change(s) fixed`);
      if (risky.length > 0) {
        toast.warning(`${risky.length} plug(s) on firmware 1.4.5+ — local control likely blocked. Do not install these in a bay.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Plug search failed");
    } finally {
      setIsDiscoveringPlugs(false);
    }
  };


  // Test TAPO login credentials
  const testTapoLogin = async () => {
    if (!isElectron || !window.electronAPI) {
      toast.error("Login test requires desktop app");
      return;
    }
    
    if (!tapoEmail || !tapoPassword) {
      toast.error("Please enter your TAPO email and password");
      return;
    }
    
    setIsTestingLogin(true);
    setLoginTestResult(null);
    
    try {
      const result = await window.electronAPI.tapoTestLogin(tapoEmail, tapoPassword);
      
      if (result.success) {
        setLoginTestResult({ success: true, message: "Login successful! Credentials are valid." });
        toast.success("TAPO login successful!");
      } else {
        setLoginTestResult({ success: false, message: result.error || "Login failed" });
        toast.error(`Login failed: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setLoginTestResult({ success: false, message: errorMsg });
      toast.error(`Login test error: ${errorMsg}`);
    } finally {
      setIsTestingLogin(false);
    }
  };

  const turnOnPlugs = async (isManual = false, showToast = true) => {
    console.log("Turning ON plugs for bay:", selectedBay, isManual ? "(MANUAL)" : "(AUTO)");
    
    // Log automation decision with full context
    const now = new Date();
    bayLogger.logAutomationDecision(
      'plug_on',
      isManual ? 'Manual trigger' : 'Auto trigger from booking window',
      {
        bookingId: activeBooking?.id,
        bookingWindow: activeBooking ? { start: activeBooking.start_time, end: activeBooking.end_time } : undefined,
        preStartMinutes,
        localTime: now.toISOString(),
      }
    );
    
    // Track when plugs were turned on for timing gap diagnostics
    lastPlugOnTimeRef.current = Date.now();
    // Set manual override when manually controlling
    if (isManual) {
      setManualOverride(true);
    }
    
    if (isElectron && window.electronAPI && selectedBay) {
      const bayPlugs = getAssignedPlugsForBay(selectedBay);
      console.log("Assigned plugs for bay:", JSON.stringify(bayPlugs, null, 2));
      
      if (bayPlugs.length === 0) {
        console.warn("No plugs assigned to this bay!");
        if (showToast) toast.warning("No plugs assigned to this bay");
        return;
      }
      
      // Validate credentials
      if (!tapoEmail || !tapoPassword) {
        if (showToast) toast.error("TAPO credentials not configured");
        return;
      }
      
      const startTime = Date.now();
      
      // PARALLEL plug control - send all commands simultaneously for faster response
      const plugPromises = bayPlugs.map(async (plug) => {
        // Validate plug data
        if (!plug.ip || typeof plug.ip !== 'string' || plug.ip.trim() === '') {
          console.error(`Invalid IP for plug ${plug.name}:`, plug);
          if (showToast) toast.error(`Invalid IP address for ${plug.name || 'plug'}`);
          return { plug, success: false, error: 'Invalid IP' };
        }
        
        const cleanIp = plug.ip.trim();
        console.log(`Attempting to turn ON plug: ${plug.name} (${plug.type}) at ${cleanIp}`);
        
        try {
          const result = await window.electronAPI.controlPlug(tapoEmail, tapoPassword, cleanIp, 'on', plug.mac);
          if (result.resolved_ip) applyResolvedIp(plug.id, result.resolved_ip);
          console.log(`Control result for ${plug.name}:`, result);
          return { plug, success: result.success, error: result.error };
        } catch (error) {
          console.error(`Failed to turn on ${plug.name}:`, error);
          return { plug, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });
      
      // Wait for all plug commands to complete in parallel
      const results = await Promise.all(plugPromises);
      const totalRuntimeMs = Date.now() - startTime;
      
      // Log plug control results with per-plug details
      bayLogger.logPlugControlResult(
        'on',
        results.map(r => ({
          plugName: r.plug.name,
          ip: r.plug.ip,
          success: r.success,
          error: r.error,
        })),
        totalRuntimeMs,
        activeBooking?.id
      );
      
      // Process results and update status
      const newStatusUpdated = { monitor: false, projector: false };
      for (const { plug, success, error } of results) {
        if (!success) {
          if (showToast) toast.error(`Failed to turn on ${plug.name}: ${error}`);
          bayLogger.logError(`Failed to turn on plug: ${plug.name}`, error, activeBooking?.id);
        } else {
          if (showToast) toast.success(`Turned ON: ${plug.name}`);
          bayLogger.logPlugControl('on', plug.name, isManual, activeBooking?.id);
          newStatusUpdated[plug.type ?? 'monitor'] = true;
        }
      }
      
      setPlugsStatus(newStatusUpdated);
    } else {
      console.log("Not in Electron or no bay selected");
      setPlugsStatus({ monitor: true, projector: true });
    }
  };

  const turnOffPlugs = async (isManual = false, showToast = true, retryCount = 0) => {
    console.log("Turning OFF plugs for bay:", selectedBay, isManual ? "(MANUAL)" : "(AUTO)");
    
    // Log automation decision with full context
    const now = new Date();
    bayLogger.logAutomationDecision(
      'plug_off',
      isManual ? 'Manual trigger' : 'Auto trigger - booking ended or no active booking',
      {
        bookingId: activeBooking?.id,
        bookingWindow: activeBooking ? { start: activeBooking.start_time, end: activeBooking.end_time } : undefined,
        preStartMinutes,
        localTime: now.toISOString(),
      }
    );
    
    // Set manual override when manually controlling
    if (isManual) {
      setManualOverride(true);
    }
    
    // HARD SAFETY GATE: Plugs CANNOT turn off if apps are running (non-manual).
    // This is an absolute rule. No "proceed anyway", no "max retries exceeded".
    // B2B bookings never call turnOffPlugs - they use the changeover sequence instead.
    
    if (isElectron && window.electronAPI && selectedBay) {
      // Check if apps are STILL running right before plugs turn off.
      // If they are, kill them first. If kill fails, BLOCK plug-off entirely.
      try {
        let gsproStillRunning = false;
        let proteeStillRunning = false;
        const gsproCheck = await window.electronAPI.findWindow("GSPro");
        const proteeCheck = await window.electronAPI.findWindow("ProTee");
        gsproStillRunning = !!gsproCheck?.hwnd;
        proteeStillRunning = !!proteeCheck?.hwnd;
        
        const appsAlive = gsproStillRunning || proteeStillRunning;
        bayLogger.sendLog('automation_decision', 
          `PRE-PLUG-OFF PROCESS CHECK (v1.0.21): GSPro=${gsproStillRunning ? 'RUNNING' : 'dead'}, Protee=${proteeStillRunning ? 'RUNNING' : 'dead'}, appsRunningState=${appsRunning}`,
          {
            level: appsAlive ? 'error' : 'info',
            details: { gsproStillRunning, proteeStillRunning, appsRunningState: appsRunning, isManual, retryCount },
            bookingId: activeBooking?.id,
            immediate: true,
          }
        );
        
        if (appsAlive && !isManual) {
          console.error(`[turnOffPlugs] HARD GATE: Apps still running at plug-off! Force-killing first.`);
          addLog(`⚠️ HARD GATE: Apps running - killing before plug-off (attempt ${retryCount + 1})`, 'error');
          try {
            await window.electronAPI.closeApps(["GSPro.exe", "ProteeLabs.exe"]);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (killErr) {
            console.error('[turnOffPlugs] Force-kill failed:', killErr);
          }
          
          // Re-verify apps are dead
          try {
            const gsproFinal = await window.electronAPI.findWindow("GSPro");
            const proteeFinal = await window.electronAPI.findWindow("ProTee");
            const stillAlive = !!gsproFinal?.hwnd || !!proteeFinal?.hwnd;
            
            if (stillAlive) {
              // ABSOLUTE BLOCK: Do NOT turn off plugs. Retry in 5s, no limit.
              // Plugs stay on until apps are confirmed dead.
              addLog(`🛑 PLUG-OFF BLOCKED: apps still running after kill attempt ${retryCount + 1}, retrying in 5s`, 'error');
              bayLogger.sendLog('automation_decision', `PLUG-OFF BLOCKED (attempt ${retryCount + 1}): apps still alive, retrying in 5s`, {
                level: 'error', bookingId: activeBooking?.id, immediate: true,
              });
              setTimeout(() => turnOffPlugs(isManual, showToast, retryCount + 1), 5000);
              return; // HARD RETURN - plugs stay on
            }
          } catch (recheckErr) {
            // Can't verify if apps are dead → BLOCK plug-off (assume they're still running)
            console.error('[turnOffPlugs] Safety recheck failed - BLOCKING plug-off:', recheckErr);
            addLog('🛑 PLUG-OFF BLOCKED: cannot verify app state, retrying in 5s', 'error');
            bayLogger.sendLog('automation_decision', `PLUG-OFF BLOCKED: safety recheck failed, assuming apps alive (attempt ${retryCount + 1})`, {
              level: 'error', bookingId: activeBooking?.id, immediate: true,
            });
            setTimeout(() => turnOffPlugs(isManual, showToast, retryCount + 1), 5000);
            return; // HARD RETURN - plugs stay on
          }
          
          // If we reach here, apps are confirmed dead after force-kill
          addLog('✅ Apps confirmed dead after force-kill, proceeding with plug-off', 'success');
        } else if (appsAlive && isManual) {
          addLog('Manual plug-off: apps still running, proceeding (manual override)', 'error');
        }
      } catch (safetyErr) {
        // Safety gate itself crashed → BLOCK plug-off (don't assume it's safe)
        console.error('[turnOffPlugs] Safety gate exception - BLOCKING plug-off:', safetyErr);
        bayLogger.logError('Safety gate exception - BLOCKING plug-off', safetyErr, activeBooking?.id);
        addLog('🛑 PLUG-OFF BLOCKED: safety gate error, retrying in 5s', 'error');
        setTimeout(() => turnOffPlugs(isManual, showToast, retryCount + 1), 5000);
        return; // HARD RETURN - plugs stay on
      }
      
      const bayPlugs = getAssignedPlugsForBay(selectedBay);
      console.log("Assigned plugs for bay:", bayPlugs);
      
      if (bayPlugs.length === 0) {
        console.warn("No plugs assigned to this bay!");
        return;
      }
      
      const startTime = Date.now();
      
      // PARALLEL plug control - send all commands simultaneously for faster response
      const plugPromises = bayPlugs.map(async (plug) => {
        console.log(`Attempting to turn OFF plug: ${plug.name} (${plug.type}) at ${plug.ip}`);
        try {
          const result = await window.electronAPI.controlPlug(tapoEmail, tapoPassword, plug.ip, 'off', plug.mac);
          if (result.resolved_ip) applyResolvedIp(plug.id, result.resolved_ip);
          console.log(`Control result for ${plug.name}:`, result);
          return { plug, success: result.success, error: result.error };
        } catch (error) {
          console.error(`Failed to turn off ${plug.name}:`, error);
          return { plug, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });
      
      // Wait for all plug commands to complete in parallel
      const results = await Promise.all(plugPromises);
      const totalRuntimeMs = Date.now() - startTime;
      
      // Log plug control results with per-plug details
      bayLogger.logPlugControlResult(
        'off',
        results.map(r => ({
          plugName: r.plug.name,
          ip: r.plug.ip,
          success: r.success,
          error: r.error,
        })),
        totalRuntimeMs,
        activeBooking?.id
      );
      
      // Process results and update status
      const newStatusUpdated = { monitor: false, projector: false };
      for (const { plug, success, error } of results) {
        if (!success) {
          if (showToast) toast.error(`Failed to turn off ${plug.name}: ${error}`);
          bayLogger.logError(`Failed to turn off plug: ${plug.name}`, error, activeBooking?.id);
          // Keep as on if failed
          newStatusUpdated[plug.type ?? 'monitor'] = true;
        } else {
          if (showToast) toast.success(`Turned OFF: ${plug.name}`);
          bayLogger.logPlugControl('off', plug.name, isManual, activeBooking?.id);
        }
      }
      
      setPlugsStatus(newStatusUpdated);
    } else {
      setPlugsStatus({ monitor: false, projector: false });
    }
  };

  const showWarningNotification = (minutes: number, booking: Booking) => {
    if (!notificationConfig.enabled) return;

    const matchingConfig = notificationConfig.notifications.find(
      (n) => n.enabled && n.minutesBefore === minutes
    );
    if (!matchingConfig) return;

    const firstName = booking.customer_name?.split(" ")[0] || "there";
    const message = matchingConfig.message.replace("{firstName}", firstName);
    
    // Use configured duration (convert seconds to ms) or default to 30 seconds
    const durationMs = (matchingConfig.durationSeconds || 30) * 1000;

    if (isElectron && window.electronAPI) {
      window.electronAPI
        .showNotificationPopup(message, notificationConfig.displayLabel, durationMs)
        .catch((err) => {
          console.error("Failed to show notification popup:", err);
        });
    } else {
      console.log(`[Notification] ${minutes} minute warning:`, message);
    }
  };

  const assignPlugToBay = (plug: TapoPlug, bayNumber: number) => {
    setBayPlugAssignments(prev => {
      const existing = prev.find(a => a.bayNumber === bayNumber);
      if (existing) {
        // Add plug to existing bay assignment if not already there
        if (!existing.plugs.find(p => p.id === plug.id)) {
          return prev.map(a => 
            a.bayNumber === bayNumber 
              ? { ...a, plugs: [...a.plugs, plug] }
              : a
          );
        }
        return prev;
      } else {
        // Create new bay assignment
        return [...prev, { bayNumber, plugs: [plug] }];
      }
    });
    toast.success(`${plug.name} assigned to Bay ${bayNumber}`);
  };

  const removePlugFromBay = (plugId: string, bayNumber: number) => {
    setBayPlugAssignments(prev => 
      prev.map(a => 
        a.bayNumber === bayNumber 
          ? { ...a, plugs: a.plugs.filter(p => p.id !== plugId) }
          : a
      ).filter(a => a.plugs.length > 0)
    );
  };

  const isPlugAssigned = (plugId: string): boolean => {
    return bayPlugAssignments.some(a => a.plugs.some(p => p.id === plugId));
  };

  const getAssignedPlugsForBay = (bayNumber: number): TapoPlug[] => {
    return bayPlugAssignments.find(a => a.bayNumber === bayNumber)?.plugs || [];
  };

  const unassignedPlugs = discoveredPlugs.filter(p => !isPlugAssigned(p.id));

  // App Launch Functions

  const launchApps = async () => {
    if (!isElectron || !window.electronAPI) {
      toast.error("App launch requires desktop app");
      return;
    }

    // Re-entrancy guard: prevent multiple parallel launchApps calls
    if (launchInProgressRef.current) {
      console.log('[BayController] launchApps already in progress, skipping');
      return;
    }
    launchInProgressRef.current = true;
    setIsLaunchingApps(true);

    // Calculate timing diagnostics
    const plugOnTimestamp = lastPlugOnTimeRef.current;
    const secondsSincePlugOn = plugOnTimestamp ? Math.round((Date.now() - plugOnTimestamp) / 1000) : null;
    const isColdStart = !plugOnTimestamp || secondsSincePlugOn === null || secondsSincePlugOn > 600; // >10min = cold start
    
    bayLogger.logAutomationDecision(
      'app_launch',
      `Pre-launch display check starting - plugs on ${secondsSincePlugOn !== null ? `${secondsSincePlugOn}s ago` : 'unknown'} (${isColdStart ? 'cold start' : 'warm'})`,
      {
        bookingId: activeBooking?.id,
        bookingWindow: activeBooking ? { start: activeBooking.start_time, end: activeBooking.end_time } : undefined,
        preStartMinutes,
        localTime: new Date().toISOString(),
        serverTimeOffset: secondsSincePlugOn,
      }
    );

    // Perform display check with retry mechanism (up to 3 attempts, 10s apart)
    const MAX_DISPLAY_RETRIES = 3;
    const DISPLAY_RETRY_DELAY_MS = 10000;
    const gsproConfigured = appLaunchConfig.gsproDisplayLabel;
    const proteeConfigured = appLaunchConfig.proteeDisplayLabel;
    
    let displayCheckPassed = false;
    
    for (let attempt = 1; attempt <= MAX_DISPLAY_RETRIES; attempt++) {
      try {
        const currentDisplays = await window.electronAPI.getDisplays();
        const currentLabels = new Set(currentDisplays.map(d => d.label));
        const detectedDetails = currentDisplays.map(d => `${d.label} (${d.size.width}x${d.size.height})`);
        
        // Update our display state with the fresh list
        setDisplays(currentDisplays);
        
        // Check which configured displays are missing
        const missingDisplays: string[] = [];
        const requiredLabels: Record<string, string> = {};
        
        if (gsproConfigured) {
          requiredLabels['gspro'] = gsproConfigured;
          if (!currentLabels.has(gsproConfigured)) {
            missingDisplays.push(gsproConfigured);
          }
        }
        
        if (proteeConfigured) {
          requiredLabels['protee'] = proteeConfigured;
          if (!currentLabels.has(proteeConfigured)) {
            missingDisplays.push(proteeConfigured);
          }
        }
        
        if (missingDisplays.length === 0) {
          // All displays found
          bayLogger.sendLog('process_detection', `Display guard attempt ${attempt}/${MAX_DISPLAY_RETRIES}: PASSED - Detected: ${detectedDetails.join(', ')}`, {
            details: { 
              attempt,
              detectedLabels: Array.from(currentLabels),
              detectedDetails,
              requiredLabels,
              secondsSincePlugOn,
              isColdStart,
            },
            bookingId: activeBooking?.id,
          });
          addLog(`Display check passed (attempt ${attempt}/${MAX_DISPLAY_RETRIES}). Available: ${Array.from(currentLabels).join(', ')}`, 'success');
          displayCheckPassed = true;
          break;
        } else {
          // Some displays missing
          const isLastAttempt = attempt === MAX_DISPLAY_RETRIES;
          const retryMsg = isLastAttempt ? 'ALL RETRIES EXHAUSTED, LAUNCH CANCELLED' : `retrying in ${DISPLAY_RETRY_DELAY_MS / 1000}s`;
          
          bayLogger.sendLog('process_detection', `Display guard attempt ${attempt}/${MAX_DISPLAY_RETRIES}: FAILED - Detected: ${detectedDetails.join(', ') || 'none'} - Missing: ${missingDisplays.join(', ')} - ${retryMsg}`, {
            level: isLastAttempt ? 'error' : 'warning',
            details: {
              attempt,
              maxAttempts: MAX_DISPLAY_RETRIES,
              detectedLabels: Array.from(currentLabels),
              detectedDetails,
              missingDisplays,
              requiredLabels,
              secondsSincePlugOn,
              isColdStart,
            },
            bookingId: activeBooking?.id,
          });
          addLog(`Display check attempt ${attempt}/${MAX_DISPLAY_RETRIES}: Missing ${missingDisplays.join(', ')} (detected: ${Array.from(currentLabels).join(', ') || 'none'})`, 'error');
          
          if (!isLastAttempt) {
            addLog(`Retrying display check in ${DISPLAY_RETRY_DELAY_MS / 1000}s...`, 'info');
            await new Promise(resolve => setTimeout(resolve, DISPLAY_RETRY_DELAY_MS));
          }
        }
      } catch (err) {
        console.error(`Failed to check displays (attempt ${attempt}):`, err);
        bayLogger.logError(`Display guard attempt ${attempt}/${MAX_DISPLAY_RETRIES}: EXCEPTION`, err, activeBooking?.id);
        
        if (attempt === MAX_DISPLAY_RETRIES) {
          toast.error("Failed to verify displays - launch cancelled");
          return;
        }
        await new Promise(resolve => setTimeout(resolve, DISPLAY_RETRY_DELAY_MS));
      }
    }
    
    if (!displayCheckPassed) {
      toast.error(`Launch cancelled - displays not found after ${MAX_DISPLAY_RETRIES} attempts`);
      addLog(`Launch cancelled - configured displays not detected after ${MAX_DISPLAY_RETRIES} retries`, 'error');
      // Set a 60-second cooldown before the next auto-launch attempt
      launchFailedCooldownUntilRef.current = Date.now() + 60000;
      launchInProgressRef.current = false;
      setIsLaunchingApps(false);
      return;
    }

    setAppLaunchStatus("Starting app launch sequence...");
    addLog("Starting app launch sequence...", 'info');

    try {
      const launchConfig = {
        gsproPath: appLaunchConfig.gsproPath,
        proteeLabsPath: appLaunchConfig.proteeLabsPath,
        gsproDisplay: 0, // Legacy fallback
        proteeDisplay: 0, // Legacy fallback
        gsproDisplayLabel: appLaunchConfig.gsproDisplayLabel,
        proteeDisplayLabel: appLaunchConfig.proteeDisplayLabel,
        postLaunchDelay: 3000,
        firstName: activeBooking?.customer_name?.split(' ')[0] || 'Guest'
      };
      
      addLog(`GSPRO Path: ${launchConfig.gsproPath}`, 'info');
      addLog(`Protee Path: ${launchConfig.proteeLabsPath || 'NOT SET'}`, launchConfig.proteeLabsPath ? 'info' : 'error');
      addLog(`GSPRO Display: ${appLaunchConfig.gsproDisplayLabel || 'default'}`, 'info');
      addLog(`Protee Display: ${appLaunchConfig.proteeDisplayLabel || 'default'}`, 'info');
      addLog(`Customer: ${launchConfig.firstName}`, 'info');

      // App Restore chain (gated by the master toggle in Bay Controller settings):
      //   1. If the customer has a saved snapshot → restore it.
      //   2. Otherwise (or no user_id) → apply the shared baseline files.
      // Baseline is now a FALLBACK only — it never overwrites a good snapshot.
      try {
        const cfg = await window.electronAPI.getBaselineConfig();
        if (!cfg?.enabled) {
          addLog('[Settings] App Restore disabled — launching against current disk state', 'info');
          bayLogger.sendLog('automation_decision', '[Settings] App Restore disabled — skipping snapshot + baseline', { bookingId: activeBooking?.id });
        } else {
          let restoredCount = 0;
          if (activeBooking?.user_id) {
            try {
              bayLogger.sendLog('automation_decision', `[Settings] Restoring snapshot for user ${activeBooking.user_id} (booking ${activeBooking.id})`, { bookingId: activeBooking.id });
              const restored = await restoreUserGsproSettings(activeBooking.user_id, {
                bayNumber: selectedBay,
                bookingId: activeBooking.id,
                appVersion,
              });
              restoredCount = restored.restored.length;
              if (restoredCount) {
                const msg = `[Settings] Restored customer GSPro snapshot: ${restored.restored.join(', ')}`;
                addLog(msg, 'info');
                bayLogger.sendLog('automation_decision', msg, { bookingId: activeBooking.id });
              } else {
                const msg = `[Settings] No customer snapshot found${restored.error ? ` (error: ${restored.error})` : ''} — falling back to baseline`;
                addLog(msg, 'info');
                bayLogger.sendLog('automation_decision', msg, { bookingId: activeBooking.id, level: restored.error ? 'warning' : 'info' });
              }
            } catch (e) {
              console.error('[BayController] restoreUserGsproSettings failed:', e);
              bayLogger.logError('[Settings] Restore snapshot exception — will fall back to baseline', e, activeBooking.id);
            }
          } else {
            addLog('[Settings] No user_id on active booking — using baseline', 'info');
            bayLogger.sendLog('automation_decision', '[Settings] No user_id on active booking — using baseline', { bookingId: activeBooking?.id, level: 'warning' });
          }

          if (restoredCount === 0) {
            try {
              const baseline = await window.electronAPI.restoreBaselineNow();
              if (baseline?.success) {
                const ok = (baseline.results || []).filter((r: any) => r.success).map((r: any) => r.file);
                const msg = ok.length
                  ? `[Settings] Applied baseline fallback: ${ok.join(', ')}`
                  : `[Settings] Baseline fallback returned no files`;
                addLog(msg, 'info');
                bayLogger.sendLog('automation_decision', msg, { bookingId: activeBooking?.id });

                // CRITICAL: also refresh the attribution marker so the T-3m
                // capture uploads under THIS booking's user, not whoever was
                // restored last time the controller ran. Without this, a
                // stale in-memory marker from a previous session (e.g.
                // yesterday's customer) causes 403s from bay-controller-api.
                if (ok.length && activeBooking?.user_id && window.electronAPI.captureUserSettingsSnapshot) {
                  try {
                    await window.electronAPI.captureUserSettingsSnapshot(activeBooking.user_id);
                    bayLogger.sendLog('automation_decision', `[Settings] Attribution marker set to ${activeBooking.user_id} (baseline path)`, { bookingId: activeBooking.id });
                  } catch (e) {
                    console.error('[BayController] captureUserSettingsSnapshot (baseline) failed:', e);
                  }
                }
              } else if (baseline?.error) {
                addLog(`[Settings] Baseline fallback skipped: ${baseline.error}`, 'info');
                bayLogger.sendLog('automation_decision', `[Settings] Baseline fallback skipped: ${baseline.error}`, { bookingId: activeBooking?.id, level: 'warning' });
              }
            } catch (e) {
              console.error('[BayController] restoreBaselineNow (fallback) failed:', e);
              bayLogger.logError('[Settings] Baseline fallback exception', e, activeBooking?.id);
            }
          }
        }
      } catch (e) {
        console.error('[BayController] App Restore pre-launch chain failed:', e);
        bayLogger.logError('[Settings] App Restore pre-launch chain exception', e, activeBooking?.id);
      }



      const result = await window.electronAPI.runAppSequence(launchConfig);
      
      if (result.cancelled) {
        setAppLaunchStatus("Launch cancelled");
        addLog("Launch cancelled by user", 'info');
        toast.info("App launch cancelled");
      } else if (result.success) {
        setAppsRunning(true);
        setAppLaunchStatus("All apps launched successfully");
        addLog("All apps launched successfully!", 'success');
        
        // Log display snapshot from electron for diagnostics
        if (result.displaySnapshot) {
          const displayLabels = result.displaySnapshot.map((d: any) => `${d.label} (${d.size.width}x${d.size.height})`).join(', ');
          bayLogger.sendLog('automation_decision', `App launch display snapshot: ${displayLabels}`, {
            details: { displays: result.displaySnapshot, gsproTarget: appLaunchConfig.gsproDisplayLabel, proteeTarget: appLaunchConfig.proteeDisplayLabel },
            bookingId: activeBooking?.id,
          });
        }
        
        bayLogger.logAppLaunch('GSPro', activeBooking?.id);
        bayLogger.logAppLaunch('Protee Labs', activeBooking?.id);
        toast.success("Apps launched successfully");
        
        // Log results from the welcome window sequence
        result.results?.forEach(r => {
          const status = r.success ? 'success' : (r.skipped ? 'info' : 'error');
          addLog(`${r.step}: ${r.success ? 'complete' : (r.skipped ? 'skipped' : r.error || 'failed')}`, status);
        });
      } else {
        setAppLaunchStatus(`Launch failed: ${result.error}`);
        addLog(`Launch failed: ${result.error}`, 'error');
        bayLogger.logError(`App launch failed: ${result.error}`, undefined, activeBooking?.id);
        result.results?.forEach(r => {
          addLog(`${r.step}: ${r.status || r.error || 'unknown'}`, 'error');
        });
        toast.error(`Launch failed: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setAppLaunchStatus(`Error: ${errorMsg}`);
      addLog(`Exception: ${errorMsg}`, 'error');
      bayLogger.logError('App launch exception', error, activeBooking?.id);
      toast.error(`Launch error: ${errorMsg}`);
    } finally {
      setIsLaunchingApps(false);
      launchInProgressRef.current = false;
    }
  };

  const cancelAppLaunch = async () => {
    if (!isElectron || !window.electronAPI) return;
    
    try {
      await window.electronAPI.cancelAppSequence();
      toast.info("Cancelling app launch...");
    } catch (error) {
      console.error("Failed to cancel:", error);
    }
  };

  const closeApps = async (reason?: 'scheduled' | 'manual'): Promise<boolean> => {
    if (!isElectron || !window.electronAPI) {
      toast.error("App control requires desktop app");
      return false;
    }

    const closeReason = reason || 'manual';

    // Apps must ALWAYS be killed before plugs turn off, regardless of display state.
    // Display checks are only needed before LAUNCHING apps (to ensure correct screen placement).
    // App Restore handles resetting config files so wrong-position saves are not a concern.

    try {
      // Set flag to prevent "unexpected close" log from onGsproClosed listener
      intentionalCloseInProgressRef.current = true;
      lastIntentionalAppCloseAtRef.current = Date.now();
      const result = await window.electronAPI.closeApps(["GSPro.exe", "ProteeLabs.exe"]);
      
      // Log post-close process verification
      if (result.stillRunning && result.stillRunning.length > 0) {
        const stillAlive = result.stillRunning.map(p => `${p.name} (PID ${p.pid})`).join(', ');
        bayLogger.sendLog('process_detection', `Post-close verification: STILL RUNNING - ${stillAlive}`, {
          level: 'warning',
          details: { stillRunning: result.stillRunning },
          bookingId: activeBooking?.id,
        });
      } else {
        bayLogger.sendLog('process_detection', 'Post-close verification: all processes confirmed dead', {
          bookingId: activeBooking?.id,
        });
      }
      
      if (result.success) {
        setAppsRunning(false);
        setAppLaunchStatus(null);
        bayLogger.logAppClose('GSPro', closeReason, activeBooking?.id);
        bayLogger.logAppClose('Protee Labs', closeReason, activeBooking?.id);
        toast.info("Apps closed");
      } else {
        bayLogger.sendLog('error', `closeApps returned success=false, some processes may still be alive`, {
          level: 'error',
          details: { stillRunning: result.stillRunning },
          bookingId: activeBooking?.id,
          immediate: true,
        });
        // Still mark as not running from our perspective
        setAppsRunning(false);
        setAppLaunchStatus(null);
      }
      // Clear flag after a short delay to allow GSPro close event to be processed
      setTimeout(() => { intentionalCloseInProgressRef.current = false; }, 2000);
      return result.success;
    } catch (error) {
      intentionalCloseInProgressRef.current = false;
      bayLogger.logError('Failed to close apps', error, activeBooking?.id);
      toast.error("Failed to close apps");
      return false;
    }
  };

  // Keep resumeAutoRef in sync so realtime callback can call it
  useEffect(() => {
    resumeAutoRef.current = resumeAuto;
  }, [resumeAuto]);



  const updateAppConfig = (key: keyof AppLaunchConfig, value: any) => {
    setAppLaunchConfig(prev => ({ ...prev, [key]: value }));
  };

  // Auto-launch apps based on booking time (separate effect after functions are defined)
  // CRITICAL: Apps close X seconds BEFORE booking ends to ensure they close while screens are still on
  // NOTE: For back-to-back bookings with DIFFERENT customers, the changeover effect handles
  // the close/relaunch sequence at T-1m. This effect only handles same-customer back-to-back.
  useEffect(() => {
    if (!appLaunchConfig.enabled || !isElectron) return;

    const now = currentTime;
    const today = format(now, "yyyy-MM-dd");
    const todaysBookings = bookings.filter(b => b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending'));
    
    let shouldLaunchApps = false;

    for (const booking of todaysBookings) {
      const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
      const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
      const appLaunchTime = addMinutes(startTime, -appLaunchConfig.appLaunchMinutes);
      
      // CRITICAL FIX: Don't launch apps if we're within appCloseSeconds of booking end.
      // The PrecisionScheduler handles app close at T-appCloseSeconds; re-launching here
      // after that close was the root cause of the Bay 6 crash (apps relaunched then
      // immediately killed by plug-off safety gate).
      const appCloseTime = new Date(endTime.getTime() - (appLaunchConfig.appCloseSeconds * 1000));

      // Should launch if we're past launch time but BEFORE close time
      if (isAfter(now, appLaunchTime) && isBefore(now, appCloseTime)) {
        shouldLaunchApps = true;
      }

      // Check for back-to-back - extend the launch window through the chain
      // CRITICAL: Only extend if we're already past the CURRENT booking's launch time.
      // Without this check, a B2B pair later in the day (e.g., 15:00→19:00) would set
      // shouldLaunchApps=true for the ENTIRE day up to 18:59:40, causing phantom launches
      // after earlier bookings end (Bay 6 bug: apps relaunched at 13:00 after 11-13 booking ended).
      const nextBooking = todaysBookings.find(b => b.id !== booking.id && b.start_time === booking.end_time);
      if (nextBooking && isAfter(now, appLaunchTime)) {
        const nextEndTime = parseISO(`${nextBooking.booking_date}T${nextBooking.end_time}`);
        const nextAppCloseTime = new Date(nextEndTime.getTime() - (appLaunchConfig.appCloseSeconds * 1000));
        
        // Keep apps running through the entire B2B chain (both same and different customer)
        // Changeover effect handles the close/relaunch for different customers
        if (isBefore(now, nextAppCloseTime)) {
          shouldLaunchApps = true;
        }
      }
    }

    // NOTE: App CLOSE is handled exclusively by the PrecisionScheduler (A4) and Changeover (C1).
    // This effect only handles launching apps. No shouldCloseApps logic needed.
    
    if (manualOverride) {
      return;
    }

    const changeoverInProgress = !!changeoverInProgressRef.current;
    const msSinceIntentionalClose = lastIntentionalAppCloseAtRef.current
      ? now.getTime() - lastIntentionalAppCloseAtRef.current
      : null;
    const inIntentionalCloseCooldown = msSinceIntentionalClose !== null && msSinceIntentionalClose < 5000;

    if (shouldLaunchApps && !appsRunning && !isLaunchingApps) {
      // Block relaunch if apps were intentionally closed within the last 5 seconds.
      // This prevents the race where T-20s scheduled close flips appsRunning to false,
      // triggering this effect to relaunch apps right before plug-off kills them.
      if (inIntentionalCloseCooldown) {
        return;
      }
      // Skip if in failed-launch cooldown period (prevents rapid-fire retries after display detection failure)
      if (Date.now() < launchFailedCooldownUntilRef.current) {
        return;
      }
      launchApps();
    } else if (!changeoverInProgress && !shouldLaunchApps && appsRunning) {
      // Fallback: close apps if no active booking window at all (e.g. all bookings cancelled)
      console.log('No active booking window - closing apps as fallback');
      closeApps('scheduled');
    }
  }, [currentTime, bookings, appLaunchConfig.enabled, appLaunchConfig.appLaunchMinutes, appLaunchConfig.appCloseSeconds, appsRunning, isLaunchingApps, isElectron, manualOverride]);

  // Password screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Bay Controller</CardTitle>
            <p className="text-muted-foreground">Enter password to access</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Unlock
              </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Version {appVersion}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Bay selection screen
  if (!selectedBay) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Select Bay</CardTitle>
            <p className="text-muted-foreground">Choose which bay this controller manages</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4, 5, 6, 7].map((bay) => (
                <Button
                  key={bay}
                  variant="outline"
                  size="lg"
                  className="h-20 text-xl font-bold"
                  onClick={() => setSelectedBay(bay)}
                >
                  Bay {bay}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main controller view
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Bay {selectedBay}</h1>
            <Badge variant={connectionStatus === "connected" ? "default" : "destructive"}>
              {connectionStatus === "connected" ? (
                <><CheckCircle className="w-3 h-3 mr-1" /> Connected</>
              ) : connectionStatus === "connecting" ? (
                <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Connecting</>
              ) : (
                <><XCircle className="w-3 h-3 mr-1" /> Disconnected</>
              )}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono">{format(currentTime, "HH:mm:ss")}</span>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchBookings} disabled={isLoadingBookings}>
              <RefreshCw className={`w-5 h-5 ${isLoadingBookings ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Update Available Banner */}
        {updateDownloaded && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Update v{updateDownloaded} downloaded and ready to install</span>
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (window.electronAPI) {
                  window.electronAPI.installUpdate();
                }
              }}
            >
              Install &amp; Restart
            </Button>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* TAPO Credentials */}
              <div className="space-y-2">
                <Label>TAPO Cloud Credentials</Label>
                <p className="text-sm text-muted-foreground">
                  {isElectron ? "Enter your Tapo app login to control plugs" : "Desktop app required for real plug control"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="email"
                    placeholder="Tapo Email"
                    value={tapoEmail}
                    onChange={(e) => setTapoEmail(e.target.value)}
                    disabled={!isElectron}
                  />
                  <Input
                    type="password"
                    placeholder="Tapo Password"
                    value={tapoPassword}
                    onChange={(e) => setTapoPassword(e.target.value)}
                    disabled={!isElectron}
                  />
                </div>
                {isElectron && (
                  <div className="space-y-2">
                    <Button 
                      onClick={testTapoLogin}
                      disabled={isTestingLogin || !tapoEmail || !tapoPassword}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      {isTestingLogin ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
                      ) : (
                        <><TestTube className="w-4 h-4 mr-2" /> Test TAPO Login</>
                      )}
                    </Button>
                    {loginTestResult && (
                      <div className={`p-2 rounded text-sm ${loginTestResult.success ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                        {loginTestResult.success ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            {loginTestResult.message}
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{loginTestResult.message}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!isElectron && (
                  <p className="text-xs text-amber-500">
                    Running in browser - plug control is simulated. Install the desktop app for real control.
                  </p>
                )}
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Pre-start time (minutes)</Label>
                  <p className="text-sm text-muted-foreground">Turn on plugs before booking starts</p>
                </div>
                <Select value={preStartMinutes.toString()} onValueChange={(v) => setPreStartMinutes(parseInt(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5, 10].map((min) => (
                      <SelectItem key={min} value={min.toString()}>{min} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div>
                <Label>Change Bay</Label>
                <Button 
                  variant="outline" 
                  className="w-full mt-2"
                  onClick={() => setSelectedBay(null)}
                >
                  Select Different Bay
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Status - Collapsible */}
        <CollapsibleSettingsCard
          title="Equipment Status"
          icon={<Power className={`w-5 h-5 ${plugsStatus.monitor ? "text-green-500" : "text-muted-foreground"}`} />}
          defaultOpen={false}
          headerAction={
            activeBooking ? (
              <Badge variant="default" className="mr-1">Active</Badge>
            ) : undefined
          }
        >
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>Monitor</span>
                <Badge variant={plugsStatus.monitor ? "default" : "secondary"}>
                  {plugsStatus.monitor ? "ON" : "OFF"}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>Projector</span>
                <Badge variant={plugsStatus.projector ? "default" : "secondary"}>
                  {plugsStatus.projector ? "ON" : "OFF"}
                </Badge>
              </div>
            </div>
            {activeBooking && (
              <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{activeBooking.customer_name || 'Active Booking'}</p>
                    <p className="text-sm text-muted-foreground">
                      {activeBooking.start_time.slice(0, 5)} - {activeBooking.end_time.slice(0, 5)}
                      {" "}({activeBooking.duration_hours}h, {activeBooking.player_count} player{activeBooking.player_count > 1 ? "s" : ""})
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* Mode Toggle */}
            <div className="flex items-center justify-between pt-3 border-t border-border mt-4">
              <div>
                <Label className="text-sm">Control Mode</Label>
                <p className="text-xs text-muted-foreground">
                  {manualOverride ? "Manual control active" : "Automatic booking-based control"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${!manualOverride ? "text-green-600" : "text-muted-foreground"}`}>
                  Auto
                </span>
                <Switch
                  checked={manualOverride}
                  onCheckedChange={(checked) => checked ? setToManualMode() : resumeAuto()}
                  className="data-[state=checked]:bg-orange-500"
                />
                <span className={`text-xs font-medium ${manualOverride ? "text-orange-600" : "text-muted-foreground"}`}>
                  Manual
                </span>
              </div>
            </div>
            
            {/* Manual Control Buttons */}
            <div className="flex gap-2 mt-4">
              <Button 
                onClick={() => turnOnPlugs(true)} 
                disabled={!manualOverride || (plugsStatus.monitor && plugsStatus.projector)} 
                className="flex-1"
                title={!manualOverride ? "Switch to Manual mode to control plugs" : undefined}
              >
                <Power className="w-4 h-4 mr-2" /> Turn On
              </Button>
              <Button 
                onClick={() => turnOffPlugs(true)} 
                disabled={!manualOverride || (!plugsStatus.monitor && !plugsStatus.projector)} 
                variant="outline" 
                className="flex-1"
                title={!manualOverride ? "Switch to Manual mode to control plugs" : undefined}
              >
                <Power className="w-4 h-4 mr-2" /> Turn Off
              </Button>
            </div>
            {!manualOverride && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Switch to Manual mode to enable On/Off buttons
              </p>
            )}
        </CollapsibleSettingsCard>

        {/* TAPO Smart Plugs - Collapsible */}
        <CollapsibleSettingsCard 
          title="TAPO Smart Plugs" 
          icon={<Wifi className="w-5 h-5" />} 
          defaultOpen={false}

          headerAction={
            <PlugDiagnostics 
              tapoEmail={tapoEmail} 
              tapoPassword={tapoPassword} 
              isElectron={isElectron} 
            />
          }
        >
          {/* Assigned plugs for this bay */}
          {selectedBay && getAssignedPlugsForBay(selectedBay).length > 0 && (
            <div className="space-y-2">
              <Label>Assigned to Bay {selectedBay}</Label>
              {getAssignedPlugsForBay(selectedBay).map((plug) => (
                <div key={plug.id} className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{plug.name}</p>
                      {plug.type && <Badge variant="outline" className="text-xs capitalize">{plug.type}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {plug.ip}{plug.mac ? ` · ${plug.mac}` : " · no MAC (manual)"}
                      {plug.firmware ? ` · fw ${plug.firmware}` : ""}
                    </p>
                    {plug.firmwareRisk && (
                      <p className="text-xs text-destructive">Firmware 1.4.5+ — local control likely blocked</p>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => removePlugFromBay(plug.id, selectedBay)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Network search — binds plugs by MAC so DHCP changes can't break them */}
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Search network for plugs</p>
                <p className="text-xs text-muted-foreground">
                  Finds every Tapo plug and locks it to its MAC address
                </p>
              </div>
              <Button
                onClick={discoverPlugs}
                size="sm"
                disabled={isDiscoveringPlugs || !isElectron}
              >
                {isDiscoveringPlugs ? "Searching..." : "Search"}
              </Button>
            </div>
          </div>

          {/* Manual plug entry */}
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-dashed">
            <p className="text-xs text-muted-foreground">
              Manual fallback: find plug IPs in your router admin page or TAPO mobile app (Device Settings → Device Info)
            </p>

            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="Name (e.g., Bay 1)"
                value={newPlugName}
                onChange={(e) => setNewPlugName(e.target.value)}
              />
              <Input
                placeholder="IP (e.g., 192.168.5.141)"
                value={newPlugIp}
                onChange={(e) => setNewPlugIp(e.target.value)}
              />
              <Select value={newPlugType} onValueChange={(v) => setNewPlugType(v as 'monitor' | 'projector')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monitor">Monitor</SelectItem>
                  <SelectItem value="projector">Projector</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addPlugManually} size="sm" variant="outline" className="w-full">
              Add Plug
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                {getAssignedPlugsForBay(selectedBay || 0).length} plug(s) assigned to this bay
              </p>
            </div>
          </div>
          
          {/* Unassigned plugs */}
          {unassignedPlugs.length > 0 && (
            <div className="space-y-2">
              <Label>Available Plugs ({unassignedPlugs.length})</Label>
              {unassignedPlugs.map((plug) => (
                <div key={plug.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{plug.name}</p>
                      {plug.type && <Badge variant="outline" className="text-xs capitalize">{plug.type}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {plug.ip}{plug.mac ? ` · ${plug.mac}` : " · no MAC (manual)"}
                      {plug.firmware ? ` · fw ${plug.firmware}` : ""}
                    </p>
                    {plug.firmwareRisk && (
                      <p className="text-xs text-destructive">Firmware 1.4.5+ — local control likely blocked</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(value) => assignPlugToBay(plug, parseInt(value))}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Add to Bay" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map((bay) => (
                          <SelectItem key={bay} value={bay.toString()}>Bay {bay}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeletePlug(plug.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {discoveredPlugs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No plugs yet. Hit Search to find them on the network, or add one manually by IP.

            </p>
          )}
        </CollapsibleSettingsCard>

        {/* App Launch - Collapsible, at bottom */}
        <CollapsibleSettingsCard title="App Launch" icon={<Monitor className="w-5 h-5" />} defaultOpen={false}>
          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-launch apps</Label>
              <p className="text-sm text-muted-foreground">
                Launch {appLaunchConfig.appLaunchMinutes}min before, close {appLaunchConfig.appCloseSeconds}s before end
              </p>
            </div>
            <Switch
              checked={appLaunchConfig.enabled}
              onCheckedChange={(checked) => updateAppConfig("enabled", checked)}
            />
          </div>

          <Separator />

          {/* App status */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium">App Status</p>
              <p className="text-sm text-muted-foreground">
                {appLaunchStatus || (appsRunning ? "Apps running" : "Apps not running")}
              </p>
            </div>
            <Badge variant={appsRunning ? "default" : "secondary"}>
              {appsRunning ? "Running" : "Stopped"}
            </Badge>
          </div>

          {/* Manual controls */}
          <div className="flex gap-2">
            {isLaunchingApps ? (
              <Button 
                onClick={cancelAppLaunch}
                variant="destructive"
                className="flex-1"
              >
                <XCircle className="w-4 h-4 mr-2" /> Cancel Launch
              </Button>
            ) : (
              <Button 
                onClick={launchApps} 
                disabled={appsRunning || !isElectron}
                className="flex-1"
              >
                <Play className="w-4 h-4 mr-2" /> Launch Apps
              </Button>
            )}
            <Button 
              onClick={() => closeApps('manual')} 
              disabled={!appsRunning || !isElectron}
              variant="outline" 
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-2" /> Close Apps
            </Button>
          </div>

          {!isElectron && (
            <p className="text-xs text-amber-500 text-center">
              App launch requires the desktop application
            </p>
          )}

          <Separator />

          {/* Configuration */}
          <div className="space-y-3">
            <Label>Configuration</Label>
            
            {/* GSPRO Path */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">GSPRO Path</Label>
              <div className="flex gap-2">
                <Input
                  value={appLaunchConfig.gsproPath}
                  onChange={(e) => updateAppConfig("gsproPath", e.target.value)}
                  placeholder="C:\Program Files\GSPro\GSPro.exe"
                  className="flex-1 text-xs"
                />
              </div>
            </div>

            {/* Protee Labs Path */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Protee Labs Path</Label>
              <div className="flex gap-2">
                <Input
                  value={appLaunchConfig.proteeLabsPath}
                  onChange={(e) => updateAppConfig("proteeLabsPath", e.target.value)}
                  placeholder="C:\Program Files\Protee Labs\ProteeLabs.exe"
                  className="flex-1 text-xs"
                />
              </div>
            </div>

            {/* Display assignment - uses monitor name for reliable matching */}
            {/* Shows saved config + availability status, auto-resolves when displays reconnect */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  GSPRO Display
                  {appLaunchConfig.gsproDisplayLabel && (
                    displays.some(d => d.label === appLaunchConfig.gsproDisplayLabel) 
                      ? <Badge variant="default" className="text-[10px] px-1 py-0">Available</Badge>
                      : <Badge variant="destructive" className="text-[10px] px-1 py-0">Offline</Badge>
                  )}
                </Label>
                <Select 
                  value={appLaunchConfig.gsproDisplayLabel} 
                  onValueChange={(v) => updateAppConfig("gsproDisplayLabel", v)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select display">
                      {appLaunchConfig.gsproDisplayLabel || "Select display"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Show currently detected displays */}
                    {displays.map((d) => (
                      <SelectItem key={d.id} value={d.label}>
                        {d.label} {d.isPrimary ? "(Primary)" : ""}
                      </SelectItem>
                    ))}
                    {/* Show saved config if not in current displays list */}
                    {appLaunchConfig.gsproDisplayLabel && 
                     !displays.some(d => d.label === appLaunchConfig.gsproDisplayLabel) && (
                      <SelectItem value={appLaunchConfig.gsproDisplayLabel} className="text-muted-foreground">
                        {appLaunchConfig.gsproDisplayLabel} (Saved - Offline)
                      </SelectItem>
                    )}
                    {displays.length === 0 && !appLaunchConfig.gsproDisplayLabel && (
                      <SelectItem value="" disabled>No displays detected</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  Protee Display (Touchscreen)
                  {appLaunchConfig.proteeDisplayLabel && (
                    displays.some(d => d.label === appLaunchConfig.proteeDisplayLabel) 
                      ? <Badge variant="default" className="text-[10px] px-1 py-0">Available</Badge>
                      : <Badge variant="destructive" className="text-[10px] px-1 py-0">Offline</Badge>
                  )}
                </Label>
                <Select 
                  value={appLaunchConfig.proteeDisplayLabel} 
                  onValueChange={(v) => updateAppConfig("proteeDisplayLabel", v)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select display">
                      {appLaunchConfig.proteeDisplayLabel || "Select display"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Show currently detected displays */}
                    {displays.map((d) => (
                      <SelectItem key={d.id} value={d.label}>
                        {d.label} {d.isPrimary ? "(Primary)" : ""}
                      </SelectItem>
                    ))}
                    {/* Show saved config if not in current displays list */}
                    {appLaunchConfig.proteeDisplayLabel && 
                     !displays.some(d => d.label === appLaunchConfig.proteeDisplayLabel) && (
                      <SelectItem value={appLaunchConfig.proteeDisplayLabel} className="text-muted-foreground">
                        {appLaunchConfig.proteeDisplayLabel} (Saved - Offline)
                      </SelectItem>
                    )}
                    {displays.length === 0 && !appLaunchConfig.proteeDisplayLabel && (
                      <SelectItem value="" disabled>No displays detected</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Saved Configuration Summary */}
            <div className="p-3 bg-muted/50 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Saved Display Config</Label>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    // Config is already auto-saved via useEffect, but this provides user confirmation
                    localStorage.setItem("bayController_appLaunchConfig", JSON.stringify(appLaunchConfig));
                    toast.success("Display configuration saved!");
                    addLog(`Config saved: GSPRO→${appLaunchConfig.gsproDisplayLabel}, Protee→${appLaunchConfig.proteeDisplayLabel}`, 'success');
                  }}
                  disabled={!appLaunchConfig.gsproDisplayLabel && !appLaunchConfig.proteeDisplayLabel}
                >
                  <CheckCircle className="w-3 h-3 mr-1" /> Save Config
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">GSPRO:</span>
                  {appLaunchConfig.gsproDisplayLabel ? (
                    <span className="font-medium flex items-center gap-1">
                      {appLaunchConfig.gsproDisplayLabel}
                      {displays.some(d => d.label === appLaunchConfig.gsproDisplayLabel) 
                        ? <CheckCircle className="w-3 h-3 text-green-500" />
                        : <XCircle className="w-3 h-3 text-destructive" />
                      }
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Not set</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Protee:</span>
                  {appLaunchConfig.proteeDisplayLabel ? (
                    <span className="font-medium flex items-center gap-1">
                      {appLaunchConfig.proteeDisplayLabel}
                      {displays.some(d => d.label === appLaunchConfig.proteeDisplayLabel) 
                        ? <CheckCircle className="w-3 h-3 text-green-500" />
                        : <XCircle className="w-3 h-3 text-destructive" />
                      }
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Not set</span>
                  )}
                </div>
              </div>
              
              <p className="text-[10px] text-muted-foreground">
                {displays.some(d => d.label === appLaunchConfig.gsproDisplayLabel) && 
                 displays.some(d => d.label === appLaunchConfig.proteeDisplayLabel)
                  ? "✓ All configured displays are online - ready to launch"
                  : "⚠ Some configured displays are offline - apps will launch when all displays reconnect"
                }
              </p>
            </div>

            {/* App launch timing */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Launch apps before booking</Label>
              </div>
              <Select 
                value={appLaunchConfig.appLaunchMinutes.toString()} 
                onValueChange={(v) => updateAppConfig("appLaunchMinutes", parseInt(v))}
              >
                <SelectTrigger className="w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((min) => (
                    <SelectItem key={min} value={min.toString()}>{min} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* App close timing - close before plugs turn off */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Close apps before booking ends</Label>
              </div>
              <Select 
                value={appLaunchConfig.appCloseSeconds.toString()} 
                onValueChange={(v) => updateAppConfig("appCloseSeconds", parseInt(v))}
              >
                <SelectTrigger className="w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 15, 20, 30].map((sec) => (
                    <SelectItem key={sec} value={sec.toString()}>{sec} sec</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* Detected displays - collapsed by default since config is saved */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Currently detected displays ({displays.length})
            </summary>
            <div className="mt-2 space-y-1">
              {displays.map((d) => (
                <div key={d.id} className="p-2 bg-muted rounded flex justify-between">
                  <span>{d.label || `Display ${d.index + 1}`}</span>
                  <span className="text-muted-foreground">{d.bounds.width}x{d.bounds.height}</span>
                </div>
              ))}
              {displays.length === 0 && (
                <p className="text-muted-foreground italic p-2">No displays detected (screens may be powered off)</p>
              )}
            </div>
          </details>
        </CollapsibleSettingsCard>

        {/* App Restore Settings - Collapsible */}
        <CollapsibleSettingsCard title="Controller Password" icon={<Lock className="w-5 h-5" />} defaultOpen={false}>
          <ControllerPasswordSettings />
        </CollapsibleSettingsCard>

        <CollapsibleSettingsCard title="App Restore" icon={<FileText className="w-5 h-5" />} defaultOpen={false}>
          <AppRestoreSettings isElectron={isElectron} />
        </CollapsibleSettingsCard>


        {/* Customer Notifications - Collapsible */}
        <CollapsibleSettingsCard title="Notifications" icon={<Bell className="w-5 h-5" />} defaultOpen={false}>
          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Session end warnings</Label>
              <p className="text-sm text-muted-foreground">
                Show popup messages before session ends
              </p>
            </div>
            <Switch
              checked={notificationConfig.enabled}
              onCheckedChange={(checked) => setNotificationConfig(prev => ({ ...prev, enabled: checked }))}
            />
          </div>

          <Separator />

          {/* Display selector */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-2">
              Show notifications on
              {notificationConfig.displayLabel && (
                displays.some(d => d.label === notificationConfig.displayLabel) 
                  ? <Badge variant="default" className="text-[10px] px-1 py-0">Available</Badge>
                  : <Badge variant="destructive" className="text-[10px] px-1 py-0">Offline</Badge>
              )}
            </Label>
            <Select 
              value={notificationConfig.displayLabel} 
              onValueChange={(v) => setNotificationConfig(prev => ({ ...prev, displayLabel: v }))}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select display">
                  {notificationConfig.displayLabel || "Select display"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {/* Show currently detected displays */}
                {displays.map((d) => (
                  <SelectItem key={d.id} value={d.label}>
                    {d.label} {d.isPrimary ? "(Primary)" : ""}
                  </SelectItem>
                ))}
                {/* Show saved config if not in current displays list */}
                {notificationConfig.displayLabel && 
                 !displays.some(d => d.label === notificationConfig.displayLabel) && (
                  <SelectItem value={notificationConfig.displayLabel} className="text-muted-foreground">
                    {notificationConfig.displayLabel} (Saved - Offline)
                  </SelectItem>
                )}
                {displays.length === 0 && !notificationConfig.displayLabel && (
                  <SelectItem value="" disabled>No displays detected</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Notification list */}
          <div className="space-y-3">
            <Label>Warning Messages</Label>
            {notificationConfig.notifications.map((notification, index) => (
              <div key={notification.id} className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={notification.enabled}
                      onCheckedChange={(checked) => {
                        setNotificationConfig(prev => ({
                          ...prev,
                          notifications: prev.notifications.map((n, i) => 
                            i === index ? { ...n, enabled: checked } : n
                          )
                        }));
                      }}
                    />
                    <Label className="text-sm">{notification.minutesBefore} min before end</Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNotificationConfig(prev => ({
                        ...prev,
                        notifications: prev.notifications.filter((_, i) => i !== index)
                      }));
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Time before session ends</Label>
                  <Select 
                    value={notification.minutesBefore.toString()}
                    onValueChange={(v) => {
                      setNotificationConfig(prev => ({
                        ...prev,
                        notifications: prev.notifications.map((n, i) => 
                          i === index ? { ...n, minutesBefore: parseInt(v), id: `${v}min` } : n
                        )
                      }));
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 5, 10, 15].map((min) => (
                        <SelectItem key={min} value={min.toString()}>{min} minute{min > 1 ? 's' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Message (use {'{firstName}'} for customer name)
                  </Label>
                  <Input
                    value={notification.message}
                    onChange={(e) => {
                      setNotificationConfig(prev => ({
                        ...prev,
                        notifications: prev.notifications.map((n, i) => 
                          i === index ? { ...n, message: e.target.value } : n
                        )
                      }));
                    }}
                    className="text-xs"
                    placeholder="Enter notification message..."
                  />
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Display duration</Label>
                  <Select 
                    value={notification.durationSeconds?.toString() || "30"}
                    onValueChange={(v) => {
                      setNotificationConfig(prev => ({
                        ...prev,
                        notifications: prev.notifications.map((n, i) => 
                          i === index ? { ...n, durationSeconds: parseInt(v) } : n
                        )
                      }));
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 15, 20, 30, 45, 60, 90, 120].map((sec) => (
                        <SelectItem key={sec} value={sec.toString()}>
                          {sec < 60 ? `${sec} seconds` : `${sec / 60} minute${sec > 60 ? 's' : ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="space-y-0.5 pr-2">
                    <Label className="text-xs">Show Extend QR code</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Adds a QR customers can scan to extend their session
                    </p>
                  </div>
                  <Switch
                    checked={!!notification.showExtendQr}
                    onCheckedChange={(checked) => {
                      setNotificationConfig(prev => ({
                        ...prev,
                        notifications: prev.notifications.map((n, i) =>
                          i === index ? { ...n, showExtendQr: checked } : n
                        )
                      }));
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Add new notification button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const existingMinutes = notificationConfig.notifications.map(n => n.minutesBefore);
                const availableMinutes = [1, 2, 3, 5, 10, 15].filter(m => !existingMinutes.includes(m));
                const newMinutes = availableMinutes[0] || 5;
                
                setNotificationConfig(prev => ({
                  ...prev,
                  notifications: [
                    ...prev.notifications,
                    {
                      id: `${newMinutes}min`,
                      minutesBefore: newMinutes,
                      message: `Hi {firstName}, your session ends in ${newMinutes} minute${newMinutes > 1 ? 's' : ''}.`,
                      enabled: true,
                      durationSeconds: 30
                    }
                  ]
                }));
              }}
            >
              + Add Notification
            </Button>
          </div>
        </CollapsibleSettingsCard>

        {/* Kiosk Mode - Collapsible */}
        <CollapsibleSettingsCard
          title="Kiosk Mode (Beta)"
          icon={<Lock className={`w-5 h-5 ${kioskEnabled ? "text-orange-500" : "text-muted-foreground"}`} />}
          defaultOpen={false}
          headerAction={
            kioskEnabled ? <Badge className="bg-orange-500 text-white mr-1">LOCKED</Badge> : undefined
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Kills Windows Explorer to remove the taskbar, Start menu, Alt+Tab switcher and desktop,
              and swallows common shortcut combos (Alt+Tab, Alt+F4, Ctrl+Esc, Win+E/R/D/L etc.).
              GSPro, Protee Labs and Bay Controller keep running normally. Turning kiosk OFF
              restarts Explorer and restores the shell.
            </p>

            <div className="p-3 rounded-lg bg-muted border border-border space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff Unlock</p>
              <p className="text-sm">
                Press <kbd className="px-2 py-1 rounded bg-background border text-xs font-mono">Ctrl + Alt + 1</kbd> anywhere to open the password prompt.
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <Label className="text-sm">Kiosk Lockdown</Label>
                <p className="text-xs text-muted-foreground">
                  {kioskEnabled ? "Active — shortcuts blocked" : "Disabled — normal Windows shortcuts"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${!kioskEnabled ? "text-green-600" : "text-muted-foreground"}`}>Off</span>
                <Switch
                  checked={kioskEnabled}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      toggleKiosk(true);
                    } else {
                      // Require password to disable via UI too
                      setKioskUnlockPassword("");
                      setKioskUnlockError("");
                      setKioskUnlockOpen(true);
                    }
                  }}
                  className="data-[state=checked]:bg-orange-500"
                />
                <span className={`text-xs font-medium ${kioskEnabled ? "text-orange-600" : "text-muted-foreground"}`}>On</span>
              </div>
            </div>
            {!isElectron && (
              <p className="text-xs text-destructive">
                Kiosk Mode only functions in the Electron desktop build.
              </p>
            )}
          </div>
        </CollapsibleSettingsCard>



        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Upcoming Bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingBookings ? (
              <p className="text-muted-foreground text-center py-4">Loading bookings...</p>
            ) : bookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No upcoming bookings</p>
            ) : (
              <div className="space-y-2">
                {bookings.slice(0, 10).map((booking) => (
                  <div 
                    key={booking.id} 
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      activeBooking?.id === booking.id ? "bg-primary/10 border border-primary" : "bg-muted"
                    }`}
                  >
                    <div>
                      <p className="font-medium">
                        {format(parseISO(booking.booking_date), "EEE, MMM d")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {booking.start_time.slice(0, 5)} - {booking.end_time.slice(0, 5)}
                      </p>
                      {booking.customer_name && (
                        <p className="text-sm font-medium text-primary mt-1">
                          {booking.customer_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{booking.duration_hours}h</p>
                      <p className="text-xs text-muted-foreground">
                        {booking.player_count} player{booking.player_count > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>


        {/* Footer */}
        <div className="flex items-center justify-center gap-2">
          <p className="text-xs text-muted-foreground">
            Bay Controller v{appVersion}
          </p>
          {window.electronAPI?.isElectron && !updateDownloading && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-[10px] text-muted-foreground"
              onClick={async () => {
                if (!window.electronAPI) return;
                const result = await window.electronAPI.checkForUpdates();
                if (result.success && result.latestVersion && result.latestVersion !== appVersion) {
                  setUpdateDownloading(true);
                  toast(`Update v${result.latestVersion} found, downloading...`);
                } else if (result.success) {
                  toast("You're on the latest version");
                } else {
                  toast.error(`Update check failed: ${result.error}`);
                }
              }}
            >
              Check for updates
            </Button>
          )}
          {updateDownloading && (
            <span className="text-[10px] text-muted-foreground animate-pulse flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Downloading update...
            </span>
          )}
        </div>
      </div>

      {/* Customer notifications now shown via Electron popup windows on configured display */}

      {/* Quit Password Dialog */}
      {showQuitDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-[350px]">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-destructive/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>Quit Bay Controller</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter password to exit the application
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleQuitPasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="quit-password">Password</Label>
                  <Input
                    id="quit-password"
                    type="password"
                    value={quitPassword}
                    onChange={(e) => setQuitPassword(e.target.value)}
                    placeholder="Enter password"
                    autoFocus
                  />
                  {quitPasswordError && (
                    <p className="text-sm text-destructive">{quitPasswordError}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancelQuit}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" className="flex-1">
                    Quit App
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kiosk Unlock Dialog */}
      {kioskUnlockOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]">
          <Card className="w-[350px]">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-orange-500" />
              </div>
              <CardTitle>Unlock Kiosk Mode</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter staff password to disable kiosk lockdown
              </p>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => { e.preventDefault(); handleKioskUnlock(); }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="kiosk-password">Password</Label>
                  <Input
                    id="kiosk-password"
                    type="password"
                    value={kioskUnlockPassword}
                    onChange={(e) => setKioskUnlockPassword(e.target.value)}
                    placeholder="Enter password"
                    autoFocus
                  />
                  {kioskUnlockError && (
                    <p className="text-sm text-destructive">{kioskUnlockError}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setKioskUnlockOpen(false); setKioskUnlockPassword(""); setKioskUnlockError(""); }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    Unlock
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}


      {/* SGT Icon Button removed - now only shows on external display via Electron overlay */}

    </div>
  );
}
