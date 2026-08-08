const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods for renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Check if running in Electron
  isElectron: true,
  
  // Initialize TAPO connection
  tapoInit: (email, password) => ipcRenderer.invoke('tapo-init', { email, password }),
  
  // Test TAPO login credentials
  tapoTestLogin: (email, password) => ipcRenderer.invoke('tapo-test-login', { email, password }),
  
  // Control a specific plug (on/off/status). `mac` enables self-healing
  // re-resolution if the plug's IP changed via DHCP.
  controlPlug: (email, password, ip, action, mac) =>
    ipcRenderer.invoke('control-plug', { email, password, ip, action, mac }),

  // Discover all Tapo plugs on the network (nickname + MAC + model + firmware)
  discoverPlugs: (email, password, subnets) =>
    ipcRenderer.invoke('discover-plugs', { email, password, subnets }),
  
  // Diagnose a plug (detailed connection debugging)
  diagnosePlug: (email, password, ip) => 
    ipcRenderer.invoke('diagnose-plug', { email, password, ip }),
  
  // Check if running in Electron environment
  checkElectron: () => ipcRenderer.invoke('check-electron'),
  
  // Get the actual installed app version from Electron
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // =====================================================
  // APP AUTOMATION APIs
  // =====================================================
  
  // Get all connected displays
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  
  // Launch an application
  launchApp: (exePath) => ipcRenderer.invoke('launch-app', { exePath }),
  
  // Find a window by title pattern
  findWindow: (titlePattern) => ipcRenderer.invoke('find-window', { titlePattern }),
  
  // Move window to a specific display
  moveWindow: (hwnd, displayIndex, fullscreen = false) => 
    ipcRenderer.invoke('move-window', { hwnd, displayIndex, fullscreen }),
  
  // Minimize a window
  minimizeWindow: (hwnd) => ipcRenderer.invoke('minimize-window', { hwnd }),
  
  // Focus a window
  focusWindow: (hwnd) => ipcRenderer.invoke('focus-window', { hwnd }),
  
  // Run the full app launch sequence (GSPRO -> Protee Labs -> minimize connector -> refocus)
  runAppSequence: (config) => ipcRenderer.invoke('run-app-sequence', config),
  
  // Cancel the app launch sequence
  cancelAppSequence: () => ipcRenderer.invoke('cancel-app-sequence'),
  
  // Show welcome windows on all displays
  showWelcomeWindows: (firstName) => ipcRenderer.invoke('show-welcome-windows', { firstName }),
  
  // Close all welcome windows
  closeWelcomeWindows: () => ipcRenderer.invoke('close-welcome-windows'),
  
  // Close apps by process name
  closeApps: (appNames) => ipcRenderer.invoke('close-apps', { appNames }),
  
  // Check which simulator processes are currently running
  checkProcesses: () => ipcRenderer.invoke('check-processes'),
  
  // Check and correct window positions
  checkWindowPositions: (gsproDisplay, proteeDisplay) => 
    ipcRenderer.invoke('check-window-positions', { gsproDisplay, proteeDisplay }),
  
  // Debug: List all visible windows
  listWindows: () => ipcRenderer.invoke('list-windows'),
  
  // =====================================================
  // SECURITY / QUIT CONTROL APIs
  // =====================================================
  
  // Install downloaded update and restart
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // Manually check for updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // Listen for update events from main process
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, version) => callback(version));
    return () => ipcRenderer.removeAllListeners('update-available');
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, version) => callback(version));
    return () => ipcRenderer.removeAllListeners('update-downloaded');
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('update-error');
  },
  
  // Confirm quit (after password verification)
  confirmQuit: () => ipcRenderer.invoke('confirm-quit'),
  
  // Update authentication state in main process
  setAuthenticated: (authenticated) => ipcRenderer.invoke('set-authenticated', authenticated),
  
  // Update app launch config in main process (for global F10 hotkey)
  setAppLaunchConfig: (config) => ipcRenderer.invoke('set-app-launch-config', config),

  // =====================================================
  // KIOSK MODE APIs
  // =====================================================
  setKioskMode: (enabled, bayNumber) => ipcRenderer.invoke('set-kiosk-mode', { enabled, bayNumber }),
  onRequestKioskUnlock: (callback) => {
    ipcRenderer.on('request-kiosk-unlock', () => callback());
    return () => ipcRenderer.removeAllListeners('request-kiosk-unlock');
  },

  
  // Listen for F10 global hotkey events from main process
  onF10NoConfig: (callback) => {
    ipcRenderer.on('f10-no-config', () => callback());
    return () => ipcRenderer.removeAllListeners('f10-no-config');
  },
  onF10DisplaysNotFound: (callback) => {
    ipcRenderer.on('f10-displays-not-found', () => callback());
    return () => ipcRenderer.removeAllListeners('f10-displays-not-found');
  },
  onF10Result: (callback) => {
    ipcRenderer.on('f10-result', (event, result) => callback(result));
    return () => ipcRenderer.removeAllListeners('f10-result');
  },
  onF10Error: (callback) => {
    ipcRenderer.on('f10-error', (event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('f10-error');
  },
  
  // Listen for lock request from main process (when window shown from tray)
  onRequestLock: (callback) => {
    ipcRenderer.on('request-lock', () => callback());
    // Return cleanup function
    return () => ipcRenderer.removeAllListeners('request-lock');
  },
  
  // Listen for quit password request from main process
  onRequestQuitPassword: (callback) => {
    ipcRenderer.on('request-quit-password', () => callback());
    // Return cleanup function
    return () => ipcRenderer.removeAllListeners('request-quit-password');
  },
  
  // =====================================================
  // NOTIFICATION POPUP APIs
  // =====================================================
  
  // Show a notification popup on a specific display
  showNotificationPopup: (message, displayLabel, durationMs, extendUrl) => 
    ipcRenderer.invoke('show-notification-popup', { message, displayLabel, durationMs, extendUrl }),
  
  // Close the notification popup
  closeNotificationPopup: () => ipcRenderer.invoke('close-notification-popup'),
  
  
  // =====================================================
  // CLIPBOARD / AUTO-PASTE APIs
  // =====================================================
  
  // Copy text to clipboard and arm auto-paste mode
  // After calling this, triggerAutoPaste will do Ctrl+A, Delete, Ctrl+V
  copyForPaste: (text) => ipcRenderer.invoke('copy-for-paste', { text }),
  
  // Trigger the auto-paste sequence (Ctrl+A, Delete, Ctrl+V)
  triggerAutoPaste: () => ipcRenderer.invoke('trigger-auto-paste'),
  
  // Get auto-paste status
  getAutoPasteStatus: () => ipcRenderer.invoke('get-auto-paste-status'),
  
  // Clear/disarm auto-paste
  clearAutoPaste: () => ipcRenderer.invoke('clear-auto-paste'),
  
  // =====================================================
  // GSPRO BASELINE SETTINGS APIs
  // =====================================================
  
  // Get current baseline configuration
  getBaselineConfig: () => ipcRenderer.invoke('get-baseline-config'),
  
  // Browse for GSPro folder
  browseGsproFolder: () => ipcRenderer.invoke('browse-gspro-folder'),
  
  // Set GSPro folder path manually
  setGsproFolder: (folderPath) => ipcRenderer.invoke('set-gspro-folder', { folderPath }),
  
  // ProTee Labs config path (per-PC; auto-detected, override with Browse)
  browseProteeConfig: () => ipcRenderer.invoke('browse-protee-config'),
  resetProteeConfigPath: () => ipcRenderer.invoke('reset-protee-config-path'),

  // Browse and upload a baseline file
  browseBaselineFile: (fileName) => ipcRenderer.invoke('browse-baseline-file', { fileName }),
  
  // Enable/disable baseline restore feature
  setBaselineEnabled: (enabled) => ipcRenderer.invoke('set-baseline-enabled', { enabled }),
  
  // Manually trigger baseline restore
  restoreBaselineNow: () => ipcRenderer.invoke('restore-baseline-now'),
  
  // Check if GSPro is running
  isGsproRunning: () => ipcRenderer.invoke('is-gspro-running'),
  
  // Listen for GSPro closed event
  onGsproClosed: (callback) => {
    ipcRenderer.on('gspro-closed', () => callback());
    return () => ipcRenderer.removeAllListeners('gspro-closed');
  },
  
  // Listen for baseline restored event
  onBaselineRestored: (callback) => {
    ipcRenderer.on('baseline-restored', (event, results) => callback(results));
    return () => ipcRenderer.removeAllListeners('baseline-restored');
  },
  
  // =====================================================
  // PROTEE DISPLAY / APP RESTORE APIs
  // =====================================================
  
  // Get all display device paths (friendly name -> Windows device path)
  getDisplayDevicePaths: () => ipcRenderer.invoke('get-display-device-paths'),
  
  // Save the selected Protee display (label + device path)
  setProteeDisplay: (label, devicePath) => ipcRenderer.invoke('set-protee-display', { label, devicePath }),
  
  // Read the current CurrentStartupScreen value from the live Protee config
  readProteeCurrentScreen: () => ipcRenderer.invoke('read-protee-current-screen'),

  // =====================================================
  // RANGE SESSION / PER-CUSTOMER GSPRO SETTINGS FILE IPCs
  // =====================================================
  readGsproUserSettings: () => ipcRenderer.invoke('read-gspro-user-settings'),
  writeGsproUserSettings: (files) => ipcRenderer.invoke('write-gspro-user-settings', { files }),
  captureUserSettingsSnapshot: (userId) => ipcRenderer.invoke('capture-user-settings-snapshot', { userId }),
  getGsproLaunchTs: () => ipcRenderer.invoke('get-gspro-launch-ts'),
  scanDesktopCsvs: (sinceMs) => ipcRenderer.invoke('scan-desktop-csvs', { sinceMs }),
  deleteDesktopCsv: (filename) => ipcRenderer.invoke('delete-desktop-csv', { filename }),

  // Desktop CSV watcher: main process pushes newly-detected .csv exports here
  onDesktopCsvDetected: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-csv-detected', handler);
    return () => ipcRenderer.removeListener('desktop-csv-detected', handler);
  },

  // =====================================================
  // OBS RECORDING APIs (League Highlights pilot)
  // =====================================================
  obsConfigure: (url, password) => ipcRenderer.invoke('obs-configure', { url, password }),
  obsStartRecording: (url, password) => ipcRenderer.invoke('obs-start-recording', { url, password }),
  obsStopRecording: () => ipcRenderer.invoke('obs-stop-recording'),
  obsGetStatus: () => ipcRenderer.invoke('obs-get-status'),
  obsUploadFile: (filePath, signedUrl, contentType) =>
    ipcRenderer.invoke('obs-upload-file', { filePath, signedUrl, contentType }),
  obsFileSize: (filePath) => ipcRenderer.invoke('obs-file-size', { filePath }),
  obsTusUpload: (filePath, uploadUrl, declaredSize) =>
    ipcRenderer.invoke('obs-tus-upload', { filePath, uploadUrl, declaredSize }),
  obsDeleteFile: (filePath) => ipcRenderer.invoke('obs-delete-file', { filePath }),
  obsAddChapter: (name) => ipcRenderer.invoke('obs-add-chapter', { name }),
});
