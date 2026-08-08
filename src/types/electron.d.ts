export interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  isPrimary: boolean;
  signature: string;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getAppVersion: () => Promise<string>;
      tapoInit: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
      tapoTestLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
      controlPlug: (email: string, password: string, ip: string, action: 'on' | 'off' | 'status') => Promise<{ success: boolean; isOn?: boolean; error?: string }>;
      diagnosePlug: (email: string, password: string, ip: string) => Promise<{
        success: boolean;
        ip: string;
        raw_probe?: {
          port_80_open: boolean;
          port_9999_open: boolean;
          http_response?: string;
          likely_device?: string;
        };
        connection_attempts?: {
          device_type: string;
          success: boolean;
          error?: string;
          firmware_version?: string;
          hardware_version?: string;
        }[];
        final_status?: string;
        likely_cause?: string;
        recommendation?: string;
        error?: string;
      }>;
      // App automation
      getDisplays: () => Promise<DisplayInfo[]>;
      launchApp: (exePath: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
      findWindow: (titlePattern: string) => Promise<{ success: boolean; hwnd?: number; title?: string; error?: string }>;
      moveWindow: (hwnd: number, displayIndex: number, fullscreen?: boolean) => Promise<{ success: boolean; error?: string }>;
      minimizeWindow: (hwnd: number) => Promise<{ success: boolean; error?: string }>;
      focusWindow: (hwnd: number) => Promise<{ success: boolean; error?: string }>;
      runAppSequence: (config: { gsproPath: string; proteeLabsPath: string; gsproDisplay: number; proteeDisplay: number; gsproDisplayLabel?: string; proteeDisplayLabel?: string; postLaunchDelay?: number; firstName?: string }) => Promise<{ success: boolean; cancelled?: boolean; results?: any[]; displaySnapshot?: any[]; error?: string }>;
      cancelAppSequence: () => Promise<{ success: boolean }>;
      closeApps: (appNames: string[]) => Promise<{ success: boolean; results?: any[]; stillRunning?: { name: string; pid: number }[]; error?: string }>;
      checkProcesses: () => Promise<{ success: boolean; processes: { name: string; pid: number }[] }>;
      // Welcome window system
      showWelcomeWindows: (firstName: string) => Promise<{ success: boolean; windowCount?: number; error?: string }>;
      closeWelcomeWindows: () => Promise<{ success: boolean; error?: string }>;
      checkWindowPositions: (gsproDisplay: number | string, proteeDisplay: number | string) => Promise<{ success: boolean; results?: { app: string; found: boolean; moved?: boolean; display?: number | string }[]; error?: string }>;
      listWindows: () => Promise<{ success: boolean; windows?: { title: string; hwnd: number }[]; error?: string }>;
      // Notification popup
      showNotificationPopup: (message: string, displayLabel: string, durationMs: number, extendUrl?: string) => Promise<{ success: boolean; error?: string }>;
      closeNotificationPopup: () => Promise<{ success: boolean; error?: string }>;
      // Auto-update
      installUpdate: () => Promise<{ success: boolean }>;
      checkForUpdates: () => Promise<{ success: boolean; currentVersion?: string; latestVersion?: string; error?: string }>;
      onUpdateAvailable: (callback: (version: string) => void) => () => void;
      onUpdateDownloaded: (callback: (version: string) => void) => () => void;
      onUpdateError: (callback: (error: string) => void) => () => void;
      // Security / Quit control
      confirmQuit: () => Promise<{ success: boolean }>;
      setAuthenticated: (authenticated: boolean) => Promise<{ success: boolean }>;
      setAppLaunchConfig: (config: { gsproDisplayLabel?: string; proteeDisplayLabel?: string }) => Promise<{ success: boolean }>;
      // Kiosk Mode
      setKioskMode: (enabled: boolean, bayNumber?: number | null) => Promise<{ success: boolean; kioskModeEnabled?: boolean; shell?: { success: boolean; error?: string } }>;
      onRequestKioskUnlock: (callback: () => void) => () => void;

      onRequestLock: (callback: () => void) => () => void;
      onRequestQuitPassword: (callback: () => void) => () => void;
      // F10 global hotkey events
      onF10NoConfig: (callback: () => void) => () => void;
      onF10DisplaysNotFound: (callback: () => void) => () => void;
      onF10Result: (callback: (result: { success: boolean; results?: { app: string; found: boolean; moved?: boolean }[] }) => void) => () => void;
      onF10Error: (callback: (error: string) => void) => () => void;
      // Clipboard / Auto-paste
      copyForPaste: (text: string) => Promise<{ success: boolean; error?: string }>;
      triggerAutoPaste: () => Promise<{ success: boolean; error?: string }>;
      getAutoPasteStatus: () => Promise<{ enabled: boolean; text: string }>;
      clearAutoPaste: () => Promise<{ success: boolean }>;
      // GSPro Baseline Settings
      getBaselineConfig: () => Promise<{
        gsproFolderPath: string;
        dpsFilePath: string;
        settingsFilePath: string;
        enabled: boolean;
        hasDpsFile: boolean;
        hasSettingsFile: boolean;
        isWatching: boolean;
        proteeConfigPath?: string;
        resolvedProteeConfigPath?: string;
        proteeConfigFound?: boolean;
      }>;
      // GSPro folder / baseline files
      browseGsproFolder: () => Promise<{ success: boolean; canceled?: boolean; folderPath?: string; dpsFilePath?: string; settingsFilePath?: string; error?: string }>;
      setGsproFolder: (folderPath: string) => Promise<{ success: boolean; dpsFilePath?: string; settingsFilePath?: string; error?: string }>;
      browseProteeConfig: () => Promise<{ success: boolean; canceled?: boolean; configPath?: string; error?: string }>;
      resetProteeConfigPath: () => Promise<{ success: boolean; configPath?: string; found?: boolean }>;
      browseBaselineFile: (fileName: string) => Promise<{ success: boolean; canceled?: boolean; sourcePath?: string; storedPath?: string; error?: string }>;
      setBaselineEnabled: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
      restoreBaselineNow: () => Promise<{ success: boolean; results?: { file: string; success: boolean; error?: string }[]; error?: string }>;
      isGsproRunning: () => Promise<{ isRunning: boolean }>;
      onGsproClosed: (callback: () => void) => () => void;
      onBaselineRestored: (callback: (results: { file: string; success: boolean; error?: string }[]) => void) => () => void;
      // Range session / per-customer GSPro settings file IPCs
      readGsproUserSettings: () => Promise<{ success: boolean; files?: Record<string, string>; skipped?: string[]; restoredForUserId?: string | null; snapshotCapturedAt?: number | null; error?: string }>;
      writeGsproUserSettings: (files: Record<string, string>) => Promise<{ success: boolean; written?: string[]; error?: string }>;
      captureUserSettingsSnapshot: (userId: string) => Promise<{ success: boolean; files?: string[]; error?: string }>;
      getGsproLaunchTs: () => Promise<{ ts: number | null }>;
      scanDesktopCsvs: (sinceMs?: number) => Promise<{ success: boolean; csvs: { filename: string; base64: string; mtime: number; size: number }[]; error?: string }>;
      deleteDesktopCsv: (filename: string) => Promise<{ success: boolean; error?: string }>;
      onDesktopCsvDetected: (callback: (payload: { filename: string; base64: string; size: number; mtime: number }) => void) => () => void;

      // OBS Recording (League Highlights pilot)
      obsConfigure: (url: string, password: string) => Promise<{ success: boolean; error?: string }>;
      obsStartRecording: (url: string, password: string) => Promise<{ success: boolean; startedAtMs?: number; alreadyRecording?: boolean; error?: string }>;
      obsStopRecording: () => Promise<{ success: boolean; filePath?: string | null; mkvPath?: string | null; sizeBytes?: number | null; error?: string }>;
      obsGetStatus: () => Promise<{ success: boolean; connected?: boolean; recording?: boolean; timecode?: string; error?: string }>;
      obsUploadFile: (filePath: string, signedUrl: string, contentType?: string) => Promise<{ success: boolean; sizeBytes?: number; error?: string }>;
      obsFileSize: (filePath: string) => Promise<{ success: boolean; sizeBytes?: number; error?: string }>;
      obsTusUpload: (filePath: string, uploadUrl: string, declaredSize?: number) => Promise<{ success: boolean; sizeBytes?: number; error?: string }>;
      obsDeleteFile: (filePath: string) => Promise<{ success: boolean; alreadyGone?: boolean; error?: string }>;
      obsAddChapter: (name: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export {};