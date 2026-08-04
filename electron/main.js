const { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, clipboard, globalShortcut, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const HUB_ORIGIN = process.env.HUB_ORIGIN || "https://hub.example.com";
const VENUE_NAME = process.env.VENUE_NAME || "Your Venue";

// =====================================================
// SINGLE INSTANCE LOCK - Prevent multiple instances
// =====================================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running - quit immediately
  console.log('Another instance of Bay Controller is already running. Exiting.');
  app.quit();
} else {
  // This is the primary instance - handle second-instance event
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance - focus our window instead
    console.log('Second instance attempted - focusing existing window');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// State for auto-paste functionality
let autoPasteEnabled = false;
let autoPasteText = '';


let mainWindow;
let tray;
let tapoClient = null;
let isAppAuthenticated = false; // Track if user has entered correct password
let welcomeWindows = []; // Array of welcome windows (one per display)
let currentAppLaunchConfig = null; // Store app launch config for global F10 hotkey
let kioskModeEnabled = false; // Track kiosk lockdown state

// Shortcuts to swallow while kiosk mode is active.
// Note: Electron globalShortcut cannot block the raw Windows key on its own,
// but it can capture common combos so they never reach the OS.
const KIOSK_BLOCKED_SHORTCUTS = [
  'Alt+Tab',
  'Alt+F4',
  'Alt+Space',
  'Ctrl+Esc',
  'Ctrl+Shift+Esc',
  'Super+D',
  'Super+E',
  'Super+R',
  'Super+L',
  'Super+I',
  'Super+X',
  'Super+S',
  'Super+A',
  'Super+Tab',
  'Super+Up',
  'Super+Down',
  'Super+Left',
  'Super+Right',
];

function enableKioskShortcuts() {
  for (const accel of KIOSK_BLOCKED_SHORTCUTS) {
    try {
      if (!globalShortcut.isRegistered(accel)) {
        const ok = globalShortcut.register(accel, () => {
          console.log('[Kiosk] Swallowed shortcut:', accel);
        });
        if (!ok) console.warn('[Kiosk] Failed to register', accel);
      }
    } catch (err) {
      console.warn('[Kiosk] Error registering', accel, err?.message || err);
    }
  }
}

function disableKioskShortcuts() {
  for (const accel of KIOSK_BLOCKED_SHORTCUTS) {
    try { globalShortcut.unregister(accel); } catch {}
  }
}

// =====================================================
// KIOSK: hide/show the Windows taskbar via ShowWindow.
// Explorer.exe stays alive — so the existing desktop wallpaper stays
// painted full-screen on every monitor, CSV exports on the desktop
// remain accessible to the controller, and no Electron overlay is
// needed. We just hide Shell_TrayWnd (primary taskbar) and every
// Shell_SecondaryTrayWnd (multi-monitor taskbars).
//
// Win-key blocking is handled OUTSIDE this app via a one-time registry
// Scancode Map on the bay PC — see docs/BAY_PC_PROVISIONING.md.
// =====================================================
function setTaskbarVisible(visible) {
  const nCmdShow = visible ? 5 : 0; // 5 = SW_SHOW, 0 = SW_HIDE

  // Write the PS script to a temp file — passing multi-line C# via
  // `powershell -Command "..."` gets mangled by cmd.exe quote parsing
  // and silently no-ops. Executing a real .ps1 file is bulletproof.
  const psBody = [
    "$ErrorActionPreference = 'Stop'",
    "$sig = @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class Tb {",
    '  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string w);',
    '  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cls, string w);',
    '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);',
    "  public static int Set(int n) {",
    "    int count = 0;",
    '    IntPtr t = FindWindow("Shell_TrayWnd", null);',
    "    if (t != IntPtr.Zero) { ShowWindow(t, n); count++; }",
    "    IntPtr s = IntPtr.Zero;",
    '    while ((s = FindWindowEx(IntPtr.Zero, s, "Shell_SecondaryTrayWnd", null)) != IntPtr.Zero) {',
    "      ShowWindow(s, n); count++;",
    "    }",
    '    IntPtr b = FindWindow("Button", "Start");',
    "    if (b != IntPtr.Zero) { ShowWindow(b, n); count++; }",
    "    return count;",
    "  }",
    "}",
    "'@",
    "if (-not ('Tb' -as [type])) { Add-Type -TypeDefinition $sig -Language CSharp }",
    `$c = [Tb]::Set(${nCmdShow})`,
    'Write-Output "toggled=$c"'
  ].join("\r\n");

  const scriptPath = path.join(require('os').tmpdir(), `bay-taskbar-${Date.now()}.ps1`);
  try {
    fs.writeFileSync(scriptPath, psBody, 'utf8');
  } catch (err) {
    console.error('[Kiosk] Failed to write PS script:', err?.message || err);
    return Promise.resolve({ success: false, error: err?.message });
  }

  return new Promise((resolve) => {
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath}"`;
    exec(cmd, { windowsHide: true, timeout: 8000 }, (err, stdout, stderr) => {
      try { fs.unlinkSync(scriptPath); } catch {}
      if (err) {
        console.error('[Kiosk] Failed to toggle taskbar:', err.message, stderr);
        return resolve({ success: false, error: err.message, stderr });
      }
      const trimmed = (stdout || '').trim();
      console.log(`[Kiosk] Taskbar ${visible ? 'shown' : 'hidden'} — ${trimmed}`);
      resolve({ success: true, output: trimmed });
    });
  });
}

// Runtime backstop: while kiosk is on, poll every 500ms and kill
// StartMenuExperienceHost if it's showing a visible window. Windows
// auto-respawns the process (invisible) so this only dismisses an
// actively-open Start menu — cheap, safe, and no user impact.
// Only kills the visible instance; Windows keeps a hidden one running.
let startMenuKillerTimer = null;

function startStartMenuKiller() {
  if (startMenuKillerTimer) return;
  startMenuKillerTimer = setInterval(() => {
    if (!kioskModeEnabled) return;
    // Only kill if the process has a visible main window (Start is open).
    // -eq 0 handle means no visible window; skip.
    const ps = `Get-Process StartMenuExperienceHost -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Stop-Process -Force -ErrorAction SilentlyContinue`;
    exec(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true, timeout: 3000 }, () => {});
  }, 500);
}

function stopStartMenuKiller() {
  if (startMenuKillerTimer) {
    clearInterval(startMenuKillerTimer);
    startMenuKillerTimer = null;
  }
}

// Periodic re-hide of the taskbar. RDP sessions, explorer.exe restarts,
// display changes, and session unlock all repaint Shell_TrayWnd in a new
// state. Cheap to re-apply — ShowWindow on an already-hidden window is a no-op.
let taskbarRehideTimer = null;
function startTaskbarRehide() {
  if (taskbarRehideTimer) return;
  taskbarRehideTimer = setInterval(() => {
    if (!kioskModeEnabled) return;
    setTaskbarVisible(false).catch(() => {});
  }, 5000);
}
function stopTaskbarRehide() {
  if (taskbarRehideTimer) {
    clearInterval(taskbarRehideTimer);
    taskbarRehideTimer = null;
  }
}



const isDev = process.env.NODE_ENV === 'development';

// Crash resilience / diagnostics
let lastRendererRecoveryAt = 0;

function safeSerialize(value) {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function logProcessIssue(scope, payload) {
  try {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${scope}] ${safeSerialize(payload)}\n`;
    const logPath = path.join(app.getPath('userData'), 'controller-crash.log');
    fs.appendFileSync(logPath, logLine, 'utf8');
  } catch (err) {
    console.error('[CrashLog] Failed to write crash log:', err?.message || err);
  }
}

function recoverMainWindow(reason) {
  const now = Date.now();
  if (now - lastRendererRecoveryAt < 10000) {
    console.warn('[Resilience] Recovery suppressed (cooldown):', reason);
    return;
  }

  lastRendererRecoveryAt = now;
  console.warn('[Resilience] Attempting window recovery:', reason);
  logProcessIssue('window_recovery', { reason });

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
      mainWindow.show();
      mainWindow.focus();
      return;
    }
  } catch (err) {
    console.error('[Resilience] Reload failed, recreating window:', err?.message || err);
    logProcessIssue('window_recovery_reload_failed', err?.stack || err?.message || String(err));
  }

  try {
    createWindow();
  } catch (err) {
    console.error('[Resilience] Window recreation failed:', err?.message || err);
    logProcessIssue('window_recovery_recreate_failed', err?.stack || err?.message || String(err));
  }
}

// TAPO credentials - these should be set via environment or config
const TAPO_EMAIL = process.env.TAPO_EMAIL || '';
const TAPO_PASSWORD = process.env.TAPO_PASSWORD || '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },

    autoHideMenuBar: true,
    show: false,
    // Prevent closing via keyboard shortcuts
    closable: true
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/bay-controller');
  } else {
    // In production, load the standalone bay controller HTML directly
    const indexPath = path.join(process.resourcesPath, 'dist', 'bay-controller.html');
    console.log('Loading bay controller from:', indexPath);
    
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load app:', err);
      mainWindow.webContents.openDevTools();
    });
  }

  // Open DevTools in development or if loading fails
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    const msg = `did-fail-load code=${errorCode} desc=${errorDescription}`;
    console.error('Failed to load:', errorCode, errorDescription);
    logProcessIssue('did_fail_load', msg);
    mainWindow.webContents.openDevTools();
  });

  // Recover if renderer process crashes/exits unexpectedly
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Resilience] Renderer process gone:', details);
    logProcessIssue('render_process_gone', details);

    if (!app.isQuitting) {
      setTimeout(() => recoverMainWindow(`render-process-gone:${details?.reason || 'unknown'}`), 1500);
    }
  });

  // Recover if renderer becomes unresponsive
  mainWindow.on('unresponsive', () => {
    console.error('[Resilience] Main window became unresponsive');
    logProcessIssue('window_unresponsive', 'Main window unresponsive');

    if (!app.isQuitting) {
      setTimeout(() => recoverMainWindow('window-unresponsive'), 1500);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Enable DevTools shortcut (Ctrl+Shift+I or F12)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Minimize to tray instead of closing - ALWAYS prevent close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      // Reset authentication when hiding - forces re-auth on next show
      isAppAuthenticated = false;
      mainWindow.webContents.send('request-lock');
    }
    return false;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show Bay Controller', 
      click: () => {
        // Always reset auth and show - password will be required
        isAppAuthenticated = false;
        mainWindow.webContents.send('request-lock');
        mainWindow.show();
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        // Request password verification before quit
        mainWindow.webContents.send('request-quit-password');
        mainWindow.show();
      }
    }
  ]);

  tray.setToolTip(`${VENUE_NAME} Bay Controller`);
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    // Always reset auth and show - password will be required
    isAppAuthenticated = false;
    mainWindow.webContents.send('request-lock');
    mainWindow.show();
  });
}

// Run on startup (Windows)
app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath('exe')
});

app.whenReady().then(() => {
  createWindow();
  createTray();


  // Re-apply kiosk taskbar hide when returning from lock/RDP/suspend.
  // A new Windows session (RDP) or explorer restart repaints Shell_TrayWnd.
  const rehideIfKiosk = (reason) => {
    if (!kioskModeEnabled) return;
    console.log('[Kiosk] Re-hiding taskbar after event:', reason);
    // Small delay so explorer/session finishes initializing first.
    setTimeout(() => setTaskbarVisible(false).catch(() => {}), 1500);
    setTimeout(() => setTaskbarVisible(false).catch(() => {}), 5000);
  };
  try {
    powerMonitor.on('unlock-screen', () => rehideIfKiosk('unlock-screen'));
    powerMonitor.on('resume', () => rehideIfKiosk('resume'));
    powerMonitor.on('user-did-become-active', () => rehideIfKiosk('user-active'));
  } catch (err) {
    console.warn('[Kiosk] powerMonitor listeners failed:', err?.message || err);
  }
  screen.on('display-added', () => rehideIfKiosk('display-added'));
  screen.on('display-removed', () => rehideIfKiosk('display-removed'));
  screen.on('display-metrics-changed', () => rehideIfKiosk('display-metrics'));




  
  // =====================================================
  // AUTO-UPDATER - checks GitHub Releases for new versions
  // =====================================================
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    
    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdater] Checking for updates...');
    });
    
    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] Update available:', info.version);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', info.version);
      }
    });
    
    autoUpdater.on('update-not-available', () => {
      console.log('[AutoUpdater] App is up to date');
    });
    
    autoUpdater.on('download-progress', (progress) => {
      console.log(`[AutoUpdater] Download: ${Math.round(progress.percent)}%`);
    });
    
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdater] Update downloaded:', info.version, '- will install on next restart');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', info.version);
      }
    });
    
    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater] Error:', err.message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', err.message);
      }
    });
    
    // Check immediately on launch, then every 4 hours
    autoUpdater.checkForUpdates().catch(err => {
      console.error('[AutoUpdater] Initial check failed:', err.message);
    });
    
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.error('[AutoUpdater] Periodic check failed:', err.message);
      });
    }, 4 * 60 * 60 * 1000);
  }
  
  // Register global F7 hotkey to toggle SGT info overlay (works even when app is in tray)
  globalShortcut.register('F7', async () => {
    console.log('[GlobalShortcut] F7 pressed - toggling SGT info overlay');
    console.log('[GlobalShortcut] currentSgtDisplayLabel:', currentSgtDisplayLabel);
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      console.log('[GlobalShortcut] Closing existing SGT info window');
      sgtInfoWindow.close();
      sgtInfoWindow = null;
    } else if (currentSgtDisplayLabel) {
      console.log('[GlobalShortcut] Opening SGT info window on:', currentSgtDisplayLabel);
      await showSgtInfoOverlay(currentSgtDisplayLabel);
    } else {
      console.log('[GlobalShortcut] No currentSgtDisplayLabel set - cannot show SGT info');
    }
  });
  
  // Register global F10 hotkey to fix window positions (works even when other apps are focused)
  globalShortcut.register('F10', async () => {
    console.log('[GlobalShortcut] F10 pressed - fixing window positions');
    
    if (!currentAppLaunchConfig) {
      console.log('[GlobalShortcut] No app launch config stored - cannot fix positions');
      // Send notification to renderer if window exists
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('f10-no-config');
      }
      return;
    }
    
    try {
      const displays = screen.getAllDisplays();
      const displayInfos = displays.map((display, index) => {
        const isPrimary = display.bounds.x === 0 && display.bounds.y === 0;
        return {
          id: display.id,
          index: index,
          label: display.label || `Display ${index + 1}`,
          bounds: display.bounds,
          size: display.size,
          isPrimary: isPrimary,
          signature: `${display.size.width}x${display.size.height}`
        };
      });
      
      const gsproLabel = currentAppLaunchConfig.gsproDisplayLabel;
      const proteeLabel = currentAppLaunchConfig.proteeDisplayLabel;
      
      console.log('[GlobalShortcut] GSPRO display label:', gsproLabel);
      console.log('[GlobalShortcut] Protee display label:', proteeLabel);
      
      // Check that at least one configured display exists
      const gsproFound = displayInfos.some(d => d.label === gsproLabel);
      const proteeFound = displayInfos.some(d => d.label === proteeLabel);
      
      if (!gsproFound && !proteeFound) {
        console.log('[GlobalShortcut] Configured displays not found');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('f10-displays-not-found');
        }
        return;
      }
      
      // Pass labels directly - checkAndCorrectWindowPositions and moveWindowToDisplay now handle labels
      const result = await checkAndCorrectWindowPositions(gsproLabel, proteeLabel);
      console.log('[GlobalShortcut] Window position fix result:', result);
      
      // Send result to renderer for toast notification
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('f10-result', result);
      }
    } catch (err) {
      console.error('[GlobalShortcut] F10 window fix failed:', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('f10-error', err.message);
      }
    }
  });

  // Register global Staff Unlock hotkey (Ctrl+Alt+1) — always active so staff
  // can pop the unlock prompt even from a fullscreen customer app.
  globalShortcut.register('CommandOrControl+Alt+1', () => {
    console.log('[GlobalShortcut] Ctrl+Alt+1 pressed - requesting kiosk unlock');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('request-kiosk-unlock');
    }
  });

});

// Global crash diagnostics for main process
process.on('uncaughtException', (error) => {
  console.error('[MainProcess] uncaughtException:', error);
  logProcessIssue('uncaught_exception', error?.stack || error?.message || String(error));
});

process.on('unhandledRejection', (reason) => {
  console.error('[MainProcess] unhandledRejection:', reason);
  logProcessIssue('unhandled_rejection', safeSerialize(reason));
});

app.on('child-process-gone', (event, details) => {
  console.warn('[MainProcess] child-process-gone:', details);
  logProcessIssue('child_process_gone', details);
});

// Unregister shortcuts on quit + safety-net restore the taskbar
// so a controller crash / update / manual quit never leaves staff
// stranded with a hidden taskbar.
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (kioskModeEnabled) {
    console.log('[Kiosk] App quitting while kiosk was active — restoring taskbar as safety net');
    try { stopStartMenuKiller(); } catch {}
    try { setTaskbarVisible(true); } catch {}
  }
});



app.on('window-all-closed', () => {
  // Do nothing - prevent app from closing
  // App should only quit via authenticated quit
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle install update now (restart and install downloaded update)
ipcMain.handle('install-update', async () => {
  console.log('[AutoUpdater] Installing update and restarting...');
  autoUpdater.quitAndInstall(false, true);
  return { success: true };
});

// Handle manual check for updates
ipcMain.handle('check-for-updates', async () => {
  console.log('[AutoUpdater] Manual update check triggered');
  try {
    const result = await autoUpdater.checkForUpdates();
    console.log('[AutoUpdater] Manual check result:', result?.updateInfo?.version);
    return { success: true, currentVersion: app.getVersion(), latestVersion: result?.updateInfo?.version || null };
  } catch (err) {
    console.error('[AutoUpdater] Manual check failed:', err.message);
    return { success: false, error: err.message };
  }
});

// Handle authenticated quit from renderer
ipcMain.handle('confirm-quit', async () => {
  app.isQuitting = true;
  app.quit();
  return { success: true };
});

// Handle authentication state update from renderer
ipcMain.handle('set-authenticated', async (event, authenticated) => {
  isAppAuthenticated = authenticated;
  return { success: true };
});

// Handle app launch config update from renderer (for global F10 hotkey)
ipcMain.handle('set-app-launch-config', async (event, config) => {
  console.log('[IPC] Received app launch config:', config);
  currentAppLaunchConfig = config;
  return { success: true };
});

// Handle kiosk mode toggle from renderer.
// Kiosk = hide taskbar + swallow app-level shortcuts. Explorer stays
// alive, wallpaper stays painted, desktop CSVs remain accessible.
ipcMain.handle('set-kiosk-mode', async (event, payload) => {
  const enabled = !!(payload && payload.enabled);
  console.log('[IPC] set-kiosk-mode:', enabled);
  const wasEnabled = kioskModeEnabled;
  kioskModeEnabled = enabled;

  let shellResult = { success: true, skipped: true };

  if (kioskModeEnabled) {
    enableKioskShortcuts();
    shellResult = await setTaskbarVisible(false);
    startStartMenuKiller();
    startTaskbarRehide();
  } else {
    disableKioskShortcuts();
    stopStartMenuKiller();
    stopTaskbarRehide();
    if (wasEnabled) {
      shellResult = await setTaskbarVisible(true);
    }
  }


  return { success: true, kioskModeEnabled, shell: shellResult };
});







// Initialize TAPO connection
async function initTapo(email, password) {
  try {
    const { cloudLogin } = require('tp-link-tapo-connect');
    tapoClient = await cloudLogin(email, password);
    console.log('TAPO cloud login successful');
    return { success: true };
  } catch (error) {
    console.error('TAPO cloud login failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Test TAPO login credentials - validates format and checks tapo_control.exe exists
async function testTapoLogin(email, password) {
  try {
    if (!email || typeof email !== 'string' || email.trim() === '') {
      return { success: false, error: 'Please enter your TAPO email address' };
    }
    if (!password || typeof password !== 'string' || password.trim() === '') {
      return { success: false, error: 'Please enter your TAPO password' };
    }
    
    const cleanEmail = email.trim();
    console.log('Testing TAPO credentials format for:', cleanEmail);
    
    // Check if tapo_control.exe exists
    const path = require('path');
    const fs = require('fs');
    
    const possiblePaths = [
      path.join(__dirname, 'tapo_control.exe'),
      path.join(process.resourcesPath || '', 'tapo_control.exe'),
      path.join(app.getAppPath(), 'tapo_control.exe'),
    ];
    
    const exePath = possiblePaths.find(p => {
      try {
        fs.accessSync(p);
        return true;
      } catch { return false; }
    });
    
    if (exePath) {
      return { 
        success: true, 
        message: 'Credentials saved. Test with a plug to verify login works.' 
      };
    } else {
      return { 
        success: false, 
        error: 'tapo_control.exe not found. Please reinstall the Bay Controller app.' 
      };
    }
  } catch (error) {
    console.error('TAPO login test failed:', error.message);
    return { success: false, error: error.message };
  }
}


// Control a specific TAPO plug using bundled tapo_control.exe
// P110 plugs require the Python 'tapo' library - bundled as standalone .exe via PyInstaller
// Includes retry logic for transient KLAP authentication failures
async function controlTapoPlug(email, password, deviceIp, action, retryCount = 0) {
  const { spawn } = require('child_process');
  const path = require('path');
  const fs = require('fs');
  
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [500, 1500, 3000]; // Exponential backoff in ms
  
  const attemptControl = () => new Promise((resolve) => {
    // Validate inputs
    if (!email || typeof email !== 'string' || email.trim() === '') {
      resolve({ success: false, error: 'Invalid email address' });
      return;
    }
    if (!password || typeof password !== 'string' || password.trim() === '') {
      resolve({ success: false, error: 'Invalid password' });
      return;
    }
    if (!deviceIp || typeof deviceIp !== 'string' || deviceIp.trim() === '') {
      resolve({ success: false, error: 'Invalid device IP address' });
      return;
    }
    
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const cleanIp = deviceIp.trim();
    
    console.log(`TAPO control: ${cleanIp} -> ${action} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
    
    // Find the bundled tapo_control.exe
    const possiblePaths = [
      path.join(__dirname, 'tapo_control.exe'),
      path.join(process.resourcesPath || '', 'tapo_control.exe'),
      path.join(app.getAppPath(), 'tapo_control.exe'),
    ];
    
    const exePath = possiblePaths.find(p => {
      try {
        fs.accessSync(p);
        return true;
      } catch { return false; }
    });
    
    if (!exePath) {
      console.error('tapo_control.exe not found in:', possiblePaths);
      resolve({ success: false, error: 'tapo_control.exe not found. Please reinstall the Bay Controller app.' });
      return;
    }
    
    console.log('Using tapo_control.exe:', exePath);
    
    const proc = spawn(exePath, [cleanEmail, cleanPassword, cleanIp, action], {
      shell: false,
      windowsHide: true
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('error', (err) => {
      console.error('tapo_control.exe error:', err.message);
      resolve({ success: false, error: `Failed to run tapo_control.exe: ${err.message}`, retryable: true });
    });
    
    proc.on('close', (code) => {
      console.log('tapo_control.exe output:', stdout);
      if (stderr) console.error('tapo_control.exe stderr:', stderr);
      
      try {
        const result = JSON.parse(stdout.trim());
        // Mark authentication failures as retryable (KLAP handshake can be flaky)
        if (!result.success && result.error && 
            (result.error.toLowerCase().includes('authentication') || 
             result.error.toLowerCase().includes('timeout') ||
             result.error.toLowerCase().includes('connect'))) {
          result.retryable = true;
        }
        resolve(result);
      } catch (parseError) {
        console.error('Failed to parse output:', stdout);
        resolve({ 
          success: false, 
          error: stderr || stdout || `tapo_control.exe exited with code ${code}`,
          retryable: true
        });
      }
    });
  });
  
  // Execute the attempt
  const result = await attemptControl();
  
  // If failed and retryable, try again with backoff
  if (!result.success && result.retryable && retryCount < MAX_RETRIES) {
    const delay = RETRY_DELAYS[retryCount] || 3000;
    console.log(`TAPO control failed for ${deviceIp}, retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
    
    await new Promise(r => setTimeout(r, delay));
    return controlTapoPlug(email, password, deviceIp, action, retryCount + 1);
  }
  
  // Clean up the retryable flag before returning
  delete result.retryable;
  return result;
}

// Diagnose a TAPO plug - runs --diagnose command for detailed debugging
async function diagnoseTapoPlug(email, password, deviceIp) {
  const { spawn } = require('child_process');
  const path = require('path');
  const fs = require('fs');
  
  return new Promise((resolve) => {
    // Validate inputs
    if (!email || typeof email !== 'string' || email.trim() === '') {
      resolve({ success: false, ip: deviceIp, error: 'Invalid email address' });
      return;
    }
    if (!password || typeof password !== 'string' || password.trim() === '') {
      resolve({ success: false, ip: deviceIp, error: 'Invalid password' });
      return;
    }
    if (!deviceIp || typeof deviceIp !== 'string' || deviceIp.trim() === '') {
      resolve({ success: false, ip: deviceIp, error: 'Invalid device IP address' });
      return;
    }
    
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const cleanIp = deviceIp.trim();
    
    console.log(`TAPO diagnose: ${cleanIp}`);
    
    // Find the bundled tapo_control.exe
    const possiblePaths = [
      path.join(__dirname, 'tapo_control.exe'),
      path.join(process.resourcesPath || '', 'tapo_control.exe'),
      path.join(app.getAppPath(), 'tapo_control.exe'),
    ];
    
    const exePath = possiblePaths.find(p => {
      try {
        fs.accessSync(p);
        return true;
      } catch { return false; }
    });
    
    if (!exePath) {
      console.error('tapo_control.exe not found in:', possiblePaths);
      resolve({ success: false, ip: cleanIp, error: 'tapo_control.exe not found. Please reinstall the Bay Controller app.' });
      return;
    }
    
    console.log('Using tapo_control.exe for diagnose:', exePath);
    
    // Run with --diagnose flag
    const proc = spawn(exePath, ['--diagnose', cleanEmail, cleanPassword, cleanIp], {
      shell: false,
      windowsHide: true
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('error', (err) => {
      console.error('tapo_control.exe diagnose error:', err.message);
      resolve({ success: false, ip: cleanIp, error: `Failed to run tapo_control.exe: ${err.message}` });
    });
    
    proc.on('close', (code) => {
      console.log('tapo_control.exe diagnose output:', stdout);
      if (stderr) console.error('tapo_control.exe diagnose stderr:', stderr);
      
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (parseError) {
        console.error('Failed to parse diagnose output:', stdout);
        resolve({ 
          success: false, 
          ip: cleanIp,
          error: stderr || stdout || `tapo_control.exe exited with code ${code}`
        });
      }
    });
  });
}

// =====================================================
// APP AUTOMATION - PowerShell-based window management
// =====================================================

// Get all connected displays with their info
async function getDisplayInfo() {
  const displays = screen.getAllDisplays();
  console.log('=== RAW DISPLAY INFO ===');
  displays.forEach((d, i) => {
    console.log(`Display ${i}:`, {
      id: d.id,
      label: d.label,
      bounds: d.bounds,
      size: d.size,
      scaleFactor: d.scaleFactor
    });
  });
  
  return displays.map((display, index) => ({
    id: display.id,
    index,
    // Use label (monitor name like "SAMSUNG", "BENQ PJ") as primary identifier
    label: display.label || `Display ${index + 1}`,
    bounds: display.bounds,
    workArea: display.workArea,
    isPrimary: display.id === screen.getPrimaryDisplay().id,
    size: display.size,
    scaleFactor: display.scaleFactor
  }));
}

// Launch an application - use cmd /c start for reliable Windows path handling
// Returns immediately without waiting for the process to complete
function launchApp(exePath) {
  console.log(`=== LAUNCH APP CALLED ===`);
  console.log(`Path received: "${exePath}"`);
  
  if (!exePath || typeof exePath !== 'string' || exePath.trim() === '') {
    console.error('ERROR: exePath is empty or invalid');
    return Promise.resolve({ success: false, error: 'Path is empty or invalid' });
  }
  
  const trimmedPath = exePath.trim();
  
  // Check if file exists
  if (!fs.existsSync(trimmedPath)) {
    console.error(`ERROR: File does not exist at path: ${trimmedPath}`);
    return Promise.resolve({ success: false, error: `File not found: ${trimmedPath}` });
  }
  
  try {
    // Use cmd /c start "" "path" - this is the most reliable way on Windows
    // The start command returns immediately and the app runs independently
    const command = `cmd /c start "" "${trimmedPath}"`;
    console.log(`Executing: ${command}`);
    
    // exec but don't wait for callback - fire and forget
    exec(command, (error, stdout, stderr) => {
      // This callback fires later but we don't wait for it
      if (error) {
        console.error(`Background exec error for ${trimmedPath}:`, error.message);
      } else {
        console.log(`Background exec completed for ${trimmedPath}`);
      }
    });
    
    // Return success immediately without waiting
    console.log(`Launch initiated (fire-and-forget) for: ${trimmedPath}`);
    return Promise.resolve({ success: true, path: trimmedPath });
  } catch (error) {
    console.error(`Exception launching ${trimmedPath}:`, error.message);
    return Promise.resolve({ success: false, error: error.message });
  }
}

// Get ALL visible windows using simple Get-Process approach
async function getAllVisibleWindows() {
  try {
    // Use Get-Process which is reliable and doesn't need Add-Type
    const psScript = `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, MainWindowTitle, MainWindowHandle | ForEach-Object { @{ hwnd = $_.MainWindowHandle.ToInt64(); title = $_.MainWindowTitle; pid = $_.Id } } | ConvertTo-Json -Compress`;
    
    const { stdout, stderr } = await execAsync(`powershell -NoProfile -Command "${psScript}"`, { 
      maxBuffer: 1024 * 1024,
      timeout: 10000 
    });
    
    if (stderr) {
      console.error('PowerShell stderr:', stderr);
    }
    
    console.log('PowerShell stdout:', stdout);
    
    if (!stdout || stdout.trim() === '') {
      console.log('No windows found (empty output)');
      return [];
    }
    
    const parsed = JSON.parse(stdout.trim());
    const windows = Array.isArray(parsed) ? parsed : [parsed];
    console.log(`Found ${windows.length} windows with titles`);
    return windows;
  } catch (error) {
    console.error('Get windows failed:', error.message);
    console.error('Error details:', error);
    return [];
  }
}

// Find window by title - simple reliable approach
async function findWindowByTitle(titlePattern) {
  try {
    const windowList = await getAllVisibleWindows();
    
    console.log(`=== SEARCHING FOR: "${titlePattern}" ===`);
    console.log(`Found ${windowList.length} windows with titles:`);
    windowList.forEach(w => {
      if (w.title) console.log(`  - "${w.title}" (hwnd: ${w.hwnd})`);
    });
    
    const searchLower = titlePattern.toLowerCase();
    
    // Try exact match first
    let found = windowList.find(w => w.title && w.title.toLowerCase() === searchLower);
    
    // Then try contains match
    if (!found) {
      found = windowList.find(w => w.title && w.title.toLowerCase().includes(searchLower));
    }
    
    if (found) {
      console.log(`MATCH FOUND: "${found.title}" (hwnd: ${found.hwnd})`);
      return { success: true, hwnd: found.hwnd, title: found.title };
    }
    
    console.log(`NO MATCH for "${titlePattern}"`);
    return { success: false, windows: windowList.map(w => w.title).filter(Boolean) };
  } catch (error) {
    console.error('Find window failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Move window to specific display by label (monitor name) for reliable targeting
// Falls back to index-based lookup if label is not provided
async function moveWindowToDisplay(hwndOrLabel, displayIndexOrFullscreen, fullscreenParam) {
  let hwnd, display, fullscreen;
  
  // Support both old signature (hwnd, index, fullscreen) and new (hwnd, label, fullscreen)
  if (typeof displayIndexOrFullscreen === 'string') {
    // New signature: moveWindowToDisplay(hwnd, label, fullscreen)
    hwnd = hwndOrLabel;
    fullscreen = fullscreenParam || false;
    const displays = screen.getAllDisplays();
    display = displays.find(d => (d.label || '').toLowerCase() === displayIndexOrFullscreen.toLowerCase());
    if (!display) {
      console.error(`Display with label "${displayIndexOrFullscreen}" not found. Available: ${displays.map(d => d.label).join(', ')}`);
      return { success: false, error: `Display "${displayIndexOrFullscreen}" not found` };
    }
    console.log(`Resolved display label "${displayIndexOrFullscreen}" to bounds: ${JSON.stringify(display.bounds)}`);
  } else {
    // Legacy signature: moveWindowToDisplay(hwnd, index, fullscreen)
    hwnd = hwndOrLabel;
    fullscreen = displayIndexOrFullscreen === true ? true : (fullscreenParam || false);
    const displayIndex = typeof displayIndexOrFullscreen === 'number' ? displayIndexOrFullscreen : 0;
    const displays = screen.getAllDisplays();
    if (displayIndex >= displays.length) {
      return { success: false, error: `Display ${displayIndex} not found` };
    }
    display = displays[displayIndex];
  }
  
  const { x, y, width, height } = display.bounds;
  
  console.log(`Moving window ${hwnd} to display at ${x},${y} size ${width}x${height} (label: ${display.label})`);
  
  // Create a temporary .ps1 file for more reliable execution
  const tempScript = path.join(app.getPath('temp'), 'move_window.ps1');
  const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$h = [IntPtr]${hwnd}
[WinAPI]::ShowWindow($h, 9)
Start-Sleep -Milliseconds 200
[WinAPI]::SetWindowPos($h, [IntPtr]::Zero, ${x}, ${y}, ${width}, ${height}, 0x0040)
${fullscreen ? '[WinAPI]::ShowWindow($h, 3)' : ''}
[WinAPI]::SetForegroundWindow($h)
Write-Output "done"
`;
  
  try {
    fs.writeFileSync(tempScript, scriptContent);
    const { stdout, stderr } = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 10000 });
    console.log('Move window stdout:', stdout);
    if (stderr) console.log('Move window stderr:', stderr);
    fs.unlinkSync(tempScript);
    return { success: true };
  } catch (error) {
    console.error('Move window failed:', error.message);
    try { fs.unlinkSync(tempScript); } catch {}
    return { success: false, error: error.message };
  }
}

// Minimize a window
async function minimizeWindow(hwnd) {
  const tempScript = path.join(app.getPath('temp'), 'min_window.ps1');
  const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }
"@
[WinAPI]::ShowWindow([IntPtr]${hwnd}, 6)
`;
  
  try {
    fs.writeFileSync(tempScript, scriptContent);
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 5000 });
    fs.unlinkSync(tempScript);
    return { success: true };
  } catch (error) {
    console.error('Minimize window failed:', error.message);
    try { fs.unlinkSync(tempScript); } catch {}
    return { success: false, error: error.message };
  }
}

// Focus a window (preserves fullscreen apps - avoids ShowWindow which disrupts fullscreen)
async function focusWindow(hwnd) {
  const tempScript = path.join(app.getPath('temp'), 'focus_window.ps1');
  // For fullscreen apps like GSPro, avoid ShowWindow entirely as it can disrupt fullscreen state
  // Just use SetForegroundWindow and BringWindowToTop to bring focus without changing window state
  // AttachThreadInput helps SetForegroundWindow work reliably even when our app isn't in focus
  const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@
$h = [IntPtr]${hwnd}
# Attach to the target window's thread to allow SetForegroundWindow to work reliably
$targetThread = [WinAPI]::GetWindowThreadProcessId($h, [IntPtr]::Zero)
$currentThread = [WinAPI]::GetCurrentThreadId()
[WinAPI]::AttachThreadInput($currentThread, $targetThread, $true)
[WinAPI]::BringWindowToTop($h)
[WinAPI]::SetForegroundWindow($h)
[WinAPI]::AttachThreadInput($currentThread, $targetThread, $false)
`;
  
  try {
    fs.writeFileSync(tempScript, scriptContent);
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 5000 });
    fs.unlinkSync(tempScript);
    return { success: true };
  } catch (error) {
    console.error('Focus window failed:', error.message);
    try { fs.unlinkSync(tempScript); } catch {}
    return { success: false, error: error.message };
  }
}

// Wait for a window to appear
async function waitForWindow(titlePattern, timeoutMs = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const result = await findWindowByTitle(titlePattern);
    if (result.success) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return { success: false, error: 'Timeout waiting for window' };
}

// Cancellation flag for app launch sequence
let appLaunchCancelled = false;

// Cancel the app launch sequence
function cancelAppLaunch() {
  appLaunchCancelled = true;
  console.log('App launch sequence cancelled by user');
}

// Background watcher for ProTee United VX (API window) - runs independently
// This window auto-launches when GSPRO loads, we just need to minimize it
async function watchForProteeConnector(durationMs = 120000) {
  const startTime = Date.now();
  console.log('Starting background watcher for ProTee United VX API window (2 minute window)...');
  
  while (Date.now() - startTime < durationMs) {
    if (appLaunchCancelled) {
      console.log('ProTee United VX watcher cancelled');
      return { success: false, cancelled: true };
    }
    
    // Get all windows and look specifically for "United VX" in title
    const windowList = await getAllVisibleWindows();
    const unifiedVxWindow = windowList.find(w => 
      w.title && w.title.toLowerCase().includes('united vx')
    );
    
    if (unifiedVxWindow) {
      console.log(`ProTee United VX API window found: "${unifiedVxWindow.title}", minimizing...`);
      await minimizeWindow(unifiedVxWindow.hwnd);
      console.log('ProTee United VX API window minimized successfully');
      return { success: true, hwnd: unifiedVxWindow.hwnd };
    }
    
    // Log periodically
    const elapsed = Date.now() - startTime;
    if (elapsed % 10000 < 2000) {
      console.log(`ProTee United VX watcher: ${Math.round(elapsed/1000)}s elapsed, still searching...`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('ProTee United VX watcher timed out after 2 minutes');
  return { success: false, error: 'Timeout - window not found' };
}

// Find GSPRO window specifically (exact match on "GSPro" or "GSPRO")
async function findGsproWindow() {
  const windowList = await getAllVisibleWindows();
  const gsproWindow = windowList.find(w => 
    w.title && (
      w.title === 'GSPro' || 
      w.title === 'GSPRO' ||
      w.title.toLowerCase() === 'gspro'
    )
  );
  if (gsproWindow) {
    console.log(`GSPRO window found: "${gsproWindow.title}" (hwnd: ${gsproWindow.hwnd})`);
    return { success: true, hwnd: gsproWindow.hwnd, title: gsproWindow.title };
  }
  console.log('GSPRO window not found');
  return { success: false };
}

// Find Protee Labs window specifically (must contain "Labs" but NOT "United VX")
async function findProteeLabsWindow() {
  const windowList = await getAllVisibleWindows();
  console.log('Looking for Protee Labs window (must contain "Labs", not "United VX")...');
  windowList.forEach(w => {
    if (w.title) console.log(`  - "${w.title}"`);
  });
  
  const proteeLabsWindow = windowList.find(w => 
    w.title && 
    w.title.toLowerCase().includes('labs') &&
    !w.title.toLowerCase().includes('united vx')
  );
  
  if (proteeLabsWindow) {
    console.log(`Protee Labs window found: "${proteeLabsWindow.title}" (hwnd: ${proteeLabsWindow.hwnd})`);
    return { success: true, hwnd: proteeLabsWindow.hwnd, title: proteeLabsWindow.title };
  }
  console.log('Protee Labs window not found');
  return { success: false };
}

// Wait for all expected displays to be ready (with timeout)
async function waitForAllDisplays(expectedLabels, timeoutMs = 90000) {
  const startTime = Date.now();
  console.log(`Waiting for displays: ${expectedLabels.join(', ')} (timeout: ${timeoutMs}ms)`);
  
  while (Date.now() - startTime < timeoutMs) {
    if (appLaunchCancelled) {
      return { success: false, cancelled: true };
    }
    
    const displays = screen.getAllDisplays();
    const currentLabels = displays.map(d => d.label || `Display ${displays.indexOf(d) + 1}`);
    
    // Check if all expected labels are present (partial match)
    const allFound = expectedLabels.every(expected => 
      currentLabels.some(current => current.toLowerCase().includes(expected.toLowerCase()))
    );
    
    if (allFound) {
      console.log(`All displays ready: ${currentLabels.join(', ')}`);
      return { success: true, displays };
    }
    
    console.log(`Waiting for displays... Current: ${currentLabels.join(', ')}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('Display wait timed out');
  return { success: false, error: 'Timeout waiting for displays' };
}

// Verify apps are on correct displays (read-only check)
async function verifyAppsReady(gsproDisplayIndex, proteeDisplayIndex) {
  const displays = screen.getAllDisplays();
  const issues = [];
  let gsproReady = false;
  let proteeReady = false;
  
  // Check GSPRO
  const gsproWindow = await findGsproWindow();
  if (gsproWindow.success) {
    gsproReady = true; // For now, just check if window exists
    console.log('GSPRO window found and ready');
  } else {
    issues.push('GSPRO window not found');
  }
  
  // Check Protee Labs
  const proteeLabsWindow = await findProteeLabsWindow();
  if (proteeLabsWindow.success) {
    proteeReady = true;
    console.log('Protee Labs window found and ready');
  } else {
    issues.push('Protee Labs window not found');
  }
  
  const allReady = gsproReady && proteeReady;
  console.log(`Apps ready check: ${allReady ? 'PASSED' : 'FAILED'} - ${issues.join(', ')}`);
  
  return { allReady, gsproReady, proteeReady, issues };
}

// Run the full app launch sequence with welcome windows
// Uses a simple 35-second timer to ensure apps have time to load
async function runAppLaunchSequence(config) {
  const {
    gsproPath,
    proteeLabsPath,
    gsproDisplay,      // Can be index (number) or label (string)
    proteeDisplay,     // Can be index (number) or label (string)
    gsproDisplayLabel,  // New: pass label directly for reliable targeting
    proteeDisplayLabel, // New: pass label directly for reliable targeting
    firstName
  } = config;
  
  // Prefer labels over indices for display targeting
  const gsproTarget = gsproDisplayLabel || gsproDisplay;
  const proteeTarget = proteeDisplayLabel || proteeDisplay;
  
  console.log('=== APP LAUNCH SEQUENCE STARTED ===');
  console.log('GSPRO Path:', gsproPath);
  console.log('Protee Labs Path:', proteeLabsPath);
  console.log('GSPRO Display Target:', gsproTarget, `(label: ${gsproDisplayLabel}, index: ${gsproDisplay})`);
  console.log('Protee Display Target:', proteeTarget, `(label: ${proteeDisplayLabel}, index: ${proteeDisplay})`);
  console.log('Customer First Name:', firstName);
  
  // LOG DISPLAY ENUMERATION at launch time for diagnostics
  const launchTimeDisplays = screen.getAllDisplays();
  const displaySnapshot = launchTimeDisplays.map((d, i) => ({
    index: i,
    label: d.label || `Display ${i + 1}`,
    bounds: d.bounds,
    size: d.size,
    isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
  }));
  console.log('=== DISPLAYS AT LAUNCH TIME ===');
  displaySnapshot.forEach(d => {
    console.log(`  [${d.index}] ${d.label} - ${d.size.width}x${d.size.height} at (${d.bounds.x},${d.bounds.y})${d.isPrimary ? ' [PRIMARY]' : ''}`);
  });
  
  const results = [];
  appLaunchCancelled = false;
  // Removed fixed APP_LOAD_TIME - now we wait for ProTee United VX window dynamically
  
  try {
    // Step 0: Show welcome windows on ALL displays
    console.log('Step 0: Showing welcome windows on all displays...');
    const customerFirstName = firstName && firstName.trim() !== '' ? firstName.trim() : 'Guest';
    console.log('Using customer name:', customerFirstName);
    await showWelcomeWindows(customerFirstName);
    results.push({ step: 'show_welcome', success: true });
    
    if (appLaunchCancelled) {
      await closeWelcomeWindows();
      return { success: false, cancelled: true, results };
    }
    
    // Step 1: Launch GSPRO immediately
    console.log('Step 1: Launching GSPRO...');
    const gsproLaunch = await launchApp(gsproPath);
    console.log('GSPRO launch result:', JSON.stringify(gsproLaunch));
    results.push({ step: 'launch_gspro', ...gsproLaunch });
    if (gsproLaunch.success) {
      global.__gsproLaunchTs = Date.now();
      console.log('[Range] Recorded GSPro launch timestamp:', new Date(global.__gsproLaunchTs).toISOString());
    }
    
    if (!gsproLaunch.success) {
      await closeWelcomeWindows();
      return { success: false, error: 'Failed to launch GSPRO: ' + gsproLaunch.error, results };
    }
    
    // Wait for ProTee United VX window to appear before launching Protee Labs
    // This ensures Protee Labs connector can see the GSPRO API window
    console.log('Step 2: Waiting for ProTee United VX API window to appear before launching Protee Labs...');
    const maxWaitForApiWindow = 30000; // 30 second timeout - keeps sessions on schedule
    const apiWaitStartTime = Date.now();
    let apiWindowFound = false;
    
    while (Date.now() - apiWaitStartTime < maxWaitForApiWindow) {
      if (appLaunchCancelled) {
        await closeWelcomeWindows();
        return { success: false, cancelled: true, results };
      }
      
      // Look for ProTee United VX window
      const windowList = await getAllVisibleWindows();
      const unifiedVxWindow = windowList.find(w => 
        w.title && w.title.toLowerCase().includes('united vx')
      );
      
      if (unifiedVxWindow) {
        console.log(`ProTee United VX API window detected: "${unifiedVxWindow.title}"`);
        apiWindowFound = true;
        // Wait 2 more seconds for window to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        break;
      }
      
      const elapsed = Math.round((Date.now() - apiWaitStartTime) / 1000);
      if (elapsed % 5 === 0) {
        console.log(`  ...waiting for ProTee United VX window (${elapsed}s elapsed)...`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (!apiWindowFound) {
      console.log('ProTee United VX window not found after 60s, proceeding anyway with Protee Labs launch');
    }
    
    results.push({ step: 'wait_for_api_window', success: apiWindowFound, duration: Date.now() - apiWaitStartTime });
    
    // Step 3: Launch Protee Labs (NOW that API window is ready)
    console.log('Step 3: Launching Protee Labs...');
    if (proteeLabsPath && proteeLabsPath.trim() !== '') {
      const proteeLaunch = await launchApp(proteeLabsPath);
      console.log('Protee Labs launch result:', JSON.stringify(proteeLaunch));
      results.push({ step: 'launch_protee_labs', ...proteeLaunch });
    } else {
      console.log('Skipping Protee Labs - path not configured');
      results.push({ step: 'launch_protee_labs', skipped: true });
    }
    
    if (appLaunchCancelled) {
      await closeWelcomeWindows();
      return { success: false, cancelled: true, results };
    }
    
    // Step 4: Wait 20 more seconds for Protee Labs to fully load
    // (API window wait already provided loading time for GSPRO)
    const PROTEE_LOAD_TIME = 20000;
    console.log(`Step 4: Waiting ${PROTEE_LOAD_TIME / 1000} seconds for Protee Labs to load...`);
    
    // Check for cancellation every 5 seconds during the wait
    const checkInterval = 5000;
    let waited = 0;
    while (waited < PROTEE_LOAD_TIME) {
      if (appLaunchCancelled) {
        await closeWelcomeWindows();
        return { success: false, cancelled: true, results };
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
      console.log(`  ...${Math.round((PROTEE_LOAD_TIME - waited) / 1000)} seconds remaining`);
    }
    
    results.push({ step: 'wait_for_protee_labs', success: true, duration: PROTEE_LOAD_TIME });
    
    // Step 5: Position windows (minimize United VX, move GSPRO and Protee Labs)
    // Use labels for reliable display targeting (indices can shift between calls)
    console.log('Step 5: Positioning windows using display targets:', gsproTarget, proteeTarget);
    await checkAndCorrectWindowPositions(gsproTarget, proteeTarget);
    results.push({ step: 'position_windows', success: true });
    
    // Step 6: Focus GSPRO
    console.log('Step 6: Focusing GSPRO...');
    const gsproWindow = await findGsproWindow();
    if (gsproWindow.success) {
      await focusWindow(gsproWindow.hwnd);
      results.push({ step: 'focus_gspro', success: true });
    } else {
      console.log('GSPRO window not found, proceeding anyway');
      results.push({ step: 'focus_gspro', success: false, error: 'Window not found' });
    }
    
    // Step 7: Close all welcome windows (the big reveal!)
    console.log('Step 7: Closing welcome windows...');
    await closeWelcomeWindows();
    results.push({ step: 'close_welcome', success: true });
    
    // Final focus on GSPRO after welcome windows close
    if (gsproWindow.success) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await focusWindow(gsproWindow.hwnd);
    }
    
    console.log('=== APP LAUNCH SEQUENCE COMPLETE ===');
    return { success: true, results, displaySnapshot };
  } catch (error) {
    console.error('App launch sequence failed:', error.message);
    await closeWelcomeWindows();
    return { success: false, error: error.message, results };
  }
}

// Show welcome windows on all displays
async function showWelcomeWindows(firstName) {
  console.log(`Showing welcome windows for: ${firstName}`);
  
  // Close any existing welcome windows
  await closeWelcomeWindows();
  
  const displays = screen.getAllDisplays();
  
  // Read the welcome logo and convert to base64
  let logoBase64 = '';
  try {
    const logoPath = path.join(__dirname, 'welcome-logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (err) {
    console.log('Could not load welcome logo:', err.message);
  }
  
  // Create HTML content for welcome window - venue brand theme
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Manrope:wght@300;400;500&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #f5f3ef;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          color: #2f3134;
          overflow: hidden;
        }
        .container {
          text-align: center;
          animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .logo {
          width: 210px;
          margin-bottom: 50px;
          filter: drop-shadow(0 10px 30px rgba(31, 76, 37, 0.15));
        }
        h1 {
          font-family: 'Archivo', system-ui, sans-serif;
          font-size: 96px;
          font-weight: 400;
          color: #2f3134;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        h2 {
          font-family: 'Archivo', system-ui, sans-serif;
          font-size: 56px;
          font-weight: 400;
          color: #b5772a;
          margin-bottom: 60px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        p {
          font-family: 'Manrope', system-ui, sans-serif;
          font-size: 28px;
          font-weight: 400;
          color: #2f3134;
          opacity: 0.85;
          margin-bottom: 12px;
        }
        .loading {
          margin-top: 60px;
          display: flex;
          gap: 16px;
          justify-content: center;
        }
        .loading span {
          width: 18px;
          height: 18px;
          background: #b5772a;
          border-radius: 50%;
          animation: pulse 1.4s infinite ease-in-out;
        }
        .loading span:nth-child(1) { animation-delay: 0s; }
        .loading span:nth-child(2) { animation-delay: 0.2s; }
        .loading span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        .etiquette {
          margin-top: 48px;
          background: rgba(31, 76, 37, 0.08);
          border: 2px solid rgba(31, 76, 37, 0.15);
          border-radius: 16px;
          padding: 32px 40px;
          max-width: 720px;
          text-align: left;
        }
        .etiquette h3 {
          font-family: 'Archivo', system-ui, sans-serif;
          font-size: 36px;
          font-weight: 400;
          color: #2f3134;
          letter-spacing: 2px;
          text-transform: uppercase;
          text-align: center;
          margin: 0 0 20px 0;
        }
        .etiquette ol {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .etiquette li {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          font-family: 'Manrope', system-ui, sans-serif;
          font-size: 22px;
          color: #2f3134;
          opacity: 0.85;
          margin-bottom: 12px;
        }
        .etiquette li:last-child { margin-bottom: 0; }
        .etiquette .num {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          background: #b5772a;
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 600;
          margin-top: 2px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo" alt="${VENUE_NAME}" />` : ''}
        <h1>Hi ${firstName}!</h1>
        <h2>Welcome to ${VENUE_NAME}</h2>
        <p>Your session is starting.</p>
        <p>This window will close when you're ready to tee off!</p>
        <div class="etiquette">
          <h3>${VENUE_NAME} Etiquette</h3>
          <ol>
            <li><span class="num">1</span><span>Use a different ball after every shot, this prevents a ball cracking on you!</span></li>
            <li><span class="num">2</span><span>If you keep skying your drives, tee it down lower</span></li>
            <li><span class="num">3</span><span>Keep the bay tidy for the next golfer</span></li>
            <li><span class="num">4</span><span>Indoor Swing Syndrome is real (Google it!)</span></li>
          </ol>
        </div>
        <div class="loading">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </body>
    </html>
  `;
  
  // Create a welcome window on each display
  for (const display of displays) {
    const { x, y, width, height } = display.bounds;
    
    const welcomeWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false, // Don't steal focus from apps loading behind
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    // Ensure always on top with screen-saver level to appear above everything
    welcomeWindow.setAlwaysOnTop(true, 'screen-saver');
    
    // Set bounds explicitly first, then force fullscreen
    // This helps with projectors/secondary displays that may not respect initial fullscreen
    welcomeWindow.setBounds({ x, y, width, height });
    welcomeWindow.setFullScreen(true);
    
    welcomeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    welcomeWindows.push(welcomeWindow);
    
    console.log(`Created welcome window on display: ${display.label || 'Unknown'} at ${x},${y} size ${width}x${height}`);
  }
  
  console.log(`Created ${welcomeWindows.length} welcome windows`);
  return { success: true, windowCount: welcomeWindows.length };
}

// Close all welcome windows
async function closeWelcomeWindows() {
  console.log(`Closing ${welcomeWindows.length} welcome windows...`);
  
  for (const win of welcomeWindows) {
    try {
      if (win && !win.isDestroyed()) {
        win.close();
      }
    } catch (err) {
      console.error('Error closing welcome window:', err.message);
    }
  }
  
  welcomeWindows = [];
  return { success: true };
}

// Check window positions and move to correct displays if needed
// Accepts either display labels (strings) or indices (numbers) for backwards compatibility
// Also minimizes United VX API window and focuses GSPRO at the end
async function checkAndCorrectWindowPositions(gsproDisplay, proteeDisplay) {
  const results = [];
  
  // Capture display snapshot for diagnostics (this function has its own scope)
  const { screen: electronScreen } = require('electron');
  const currentDisplays = electronScreen.getAllDisplays();
  const displaySnapshot = currentDisplays.map((d, i) => ({
    index: i,
    label: d.label || `Display ${i + 1}`,
    bounds: d.bounds,
    size: d.size,
    isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
  }));
  
  console.log('=== CHECKING WINDOW POSITIONS ===');
  console.log('Expected GSPRO display:', gsproDisplay, typeof gsproDisplay);
  console.log('Expected Protee Labs display:', proteeDisplay, typeof proteeDisplay);
  
  // First, minimize ProTee United VX if found (so it doesn't interfere)
  const windowList = await getAllVisibleWindows();
  const unitedVxWindow = windowList.find(w => 
    w.title && w.title.toLowerCase().includes('united vx')
  );
  if (unitedVxWindow) {
    console.log('Found ProTee United VX API window, minimizing...');
    await minimizeWindow(unitedVxWindow.hwnd);
    results.push({ app: 'ProTee United VX', found: true, minimized: true });
  }
  
  // Move GSPRO to its display (pass label or index directly - moveWindowToDisplay handles both)
  const gsproWindow = await findGsproWindow();
  if (gsproWindow.success) {
    console.log(`Moving GSPRO to display ${gsproDisplay}...`);
    const moveResult = await moveWindowToDisplay(gsproWindow.hwnd, gsproDisplay, true);
    results.push({ app: 'GSPRO', found: true, moved: moveResult.success, display: gsproDisplay });
  } else {
    results.push({ app: 'GSPRO', found: false });
  }
  
  // Move Protee Labs to its display
  const proteeLabsWindow = await findProteeLabsWindow();
  if (proteeLabsWindow.success) {
    console.log(`Moving Protee Labs to display ${proteeDisplay}...`);
    const moveResult = await moveWindowToDisplay(proteeLabsWindow.hwnd, proteeDisplay, true);
    results.push({ app: 'Protee Labs', found: true, moved: moveResult.success, display: proteeDisplay });
  } else {
    results.push({ app: 'Protee Labs', found: false });
  }
  
  // Focus GSPRO last so it's on top (hides any remaining API window behind it)
  if (gsproWindow.success) {
    console.log('Focusing GSPRO window to bring it to front...');
    await focusWindow(gsproWindow.hwnd);
  }
  
  return { success: true, results, displaySnapshot };
}

// Check which simulator processes are currently running
async function checkProcesses() {
  try {
    const { stdout } = await execAsync(
      'tasklist /FO CSV /NH /FI "IMAGENAME eq GSPro.exe" /FI "IMAGENAME eq GSPRO.exe" /FI "IMAGENAME eq ProteeLabs.exe" /FI "IMAGENAME eq Protee Labs.exe"',
      { timeout: 5000 }
    );
    
    const processes = [];
    const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      // CSV format: "name.exe","PID","Session","Session#","Mem"
      const match = line.match(/"([^"]+)","(\d+)"/);
      if (match && !line.toLowerCase().includes('info:')) {
        processes.push({ name: match[1], pid: parseInt(match[2]) });
      }
    }
    
    return { success: true, processes };
  } catch (error) {
    // If no matching processes, tasklist returns exit code 1
    return { success: true, processes: [] };
  }
}

// Close ALL user-facing apps (anything with a visible window) before powering off bay.
// Whitelists Bay Controller itself + core Windows shell/system processes so the PC stays usable.
async function closeApps(appNames) {
  const results = [];

  console.log('=== CLOSING ALL USER APPS ===');

  // Processes we MUST keep alive: this Electron app, Windows shell, system services, and our own deps.
  // Matched case-insensitively against ProcessName (no .exe).
  // CRITICAL: derive our own process name from the running binary so a productName change
  // (e.g. "Bay Controller.exe") can never accidentally suicide the controller.
  const ownProcessName = path.basename(process.execPath, '.exe'); // e.g. "Bay Controller"
  const PROTECTED = [
    ownProcessName,                              // THIS RUNNING BINARY (whatever it's named)
    'Bay Controller', 'BayController',
    'BayController', 'Bay Controller',
    'electron', 'Electron',                      // dev mode
    'explorer', 'dwm', 'sihost', 'fontdrvhost',  // Windows shell
    'ctfmon', 'ShellExperienceHost', 'StartMenuExperienceHost',
    'SearchHost', 'SearchApp', 'RuntimeBroker', 'ApplicationFrameHost',
    'TextInputHost', 'LockApp', 'UserOOBEBroker',
    'svchost', 'csrss', 'wininit', 'winlogon', 'lsass', 'services',
    'smss', 'spoolsv', 'taskhostw', 'conhost', 'audiodg', 'WmiPrvSE',
    'SecurityHealthService', 'SecurityHealthSystray', 'MsMpEng', 'NisSrv',
    'cmd', 'powershell', 'pwsh',                 // in case we're invoked via shell
    'nvcontainer', 'NVDisplay.Container',        // GPU drivers (closing breaks display)
  ];
  const protectedSet = new Set(PROTECTED.map(n => n.toLowerCase()));
  // PowerShell -contains is case-sensitive; lowercase both sides for safe matching.
  const protectedList = [...protectedSet].map(n => `'${n.replace(/'/g, "''")}'`).join(',');

  // PowerShell: kill every process that has a visible main window AND isn't whitelisted.
  // This catches Protee (any version/name), GSPro, browsers, anything the customer left open.
  const psScript = `
    $protected = @(${protectedList});
    Get-Process |
      Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } |
      Where-Object { $protected -notcontains $_.ProcessName.ToLower() } |
      ForEach-Object {
        try {
          Write-Output ("KILL " + $_.ProcessName + " [" + $_.Id + "] " + $_.MainWindowTitle);
          Stop-Process -Id $_.Id -Force -ErrorAction Stop;
        } catch {
          Write-Output ("FAIL " + $_.ProcessName + ": " + $_.Exception.Message);
        }
      }
  `.replace(/\s+/g, ' ').trim();

  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 10000 });
    const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      console.log(`  ${line}`);
      if (line.startsWith('KILL ')) results.push({ app: line.slice(5), status: 'closed' });
      else if (line.startsWith('FAIL ')) results.push({ app: line.slice(5), status: 'failed' });
    }
    console.log(`Killed ${results.filter(r => r.status === 'closed').length} windowed app(s)`);
  } catch (error) {
    console.error('Bulk window-process kill failed:', error.message);
  }

  // Belt-and-braces: also explicitly kill known simulator processes by name in case
  // they run windowless background helpers (launchers, update services, etc).
  const namedKills = [
    'GSPro.exe', 'GSProLauncher.exe',
    'Protee Labs.exe', 'ProteeLabs.exe',
    'ProTee United VX.exe', 'ProTeeUnitedVX.exe',
  ];
  for (const processName of namedKills) {
    try {
      await execAsync(`taskkill /IM "${processName}" /F`, { timeout: 5000 });
      console.log(`Closed (by name): ${processName}`);
    } catch {
      // not running - fine
    }
  }

  // POST-KILL VERIFICATION: confirm no user-facing windows remain (besides Bay Controller).
  await new Promise(resolve => setTimeout(resolve, 1000));
  let stillRunning = [];
  try {
    const verifyScript = `
      $protected = @(${protectedList});
      Get-Process |
        Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } |
        Where-Object { $protected -notcontains $_.ProcessName.ToLower() } |
        ForEach-Object { Write-Output ($_.ProcessName + "|" + $_.Id) }
    `.replace(/\s+/g, ' ').trim();
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${verifyScript.replace(/"/g, '\\"')}"`, { timeout: 5000 });
    stillRunning = stdout.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [name, pid] = l.split('|');
      return { name, pid: parseInt(pid) };
    });
  } catch {
    // verification failed - assume clean
  }

  if (stillRunning.length > 0) {
    console.warn(`STILL RUNNING after bulk kill: ${stillRunning.map(p => `${p.name} (PID ${p.pid})`).join(', ')}`);
  } else {
    console.log('All user-facing apps confirmed closed');
  }

  const allDead = stillRunning.length === 0;
  console.log(`=== CLOSE APPS COMPLETE (${allDead ? 'CLEAN' : 'SOME STILL ALIVE'}) ===`);
  return { success: allDead, results, stillRunning };
}

// IPC Handlers - TAPO
ipcMain.handle('tapo-init', async (event, { email, password }) => {
  return await initTapo(email, password);
});

ipcMain.handle('tapo-test-login', async (event, { email, password }) => {
  console.log('Testing TAPO login...');
  return await testTapoLogin(email, password);
});


ipcMain.handle('control-plug', async (event, { email, password, ip, action }) => {
  console.log(`Controlling plug at ${ip}: ${action}`);
  return await controlTapoPlug(email, password, ip, action);
});

// Diagnose a plug - runs the --diagnose command for detailed debugging
ipcMain.handle('diagnose-plug', async (event, { email, password, ip }) => {
  console.log(`Diagnosing plug at ${ip}...`);
  return await diagnoseTapoPlug(email, password, ip);
});

ipcMain.handle('check-electron', async () => {
  return true;
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

// IPC Handlers - App Automation
ipcMain.handle('get-displays', async () => {
  return await getDisplayInfo();
});

ipcMain.handle('launch-app', async (event, { exePath }) => {
  return await launchApp(exePath);
});

ipcMain.handle('find-window', async (event, { titlePattern }) => {
  return await findWindowByTitle(titlePattern);
});

ipcMain.handle('move-window', async (event, { hwnd, displayIndex, fullscreen }) => {
  return await moveWindowToDisplay(hwnd, displayIndex, fullscreen);
});

ipcMain.handle('minimize-window', async (event, { hwnd }) => {
  return await minimizeWindow(hwnd);
});

ipcMain.handle('focus-window', async (event, { hwnd }) => {
  return await focusWindow(hwnd);
});

ipcMain.handle('run-app-sequence', async (event, config) => {
  return await runAppLaunchSequence(config);
});

ipcMain.handle('cancel-app-sequence', async () => {
  cancelAppLaunch();
  return { success: true };
});

ipcMain.handle('close-apps', async (event, { appNames }) => {
  return await closeApps(appNames);
});

ipcMain.handle('check-processes', async () => {
  return await checkProcesses();
});

ipcMain.handle('check-window-positions', async (event, { gsproDisplay, proteeDisplay }) => {
  return await checkAndCorrectWindowPositions(gsproDisplay, proteeDisplay);
});

// Debug: List all visible windows
ipcMain.handle('list-windows', async () => {
  const windows = await getAllVisibleWindows();
  return { 
    success: true, 
    windows: windows.map(w => ({ title: w.title, hwnd: w.hwnd })).filter(w => w.title)
  };
});

// Welcome window handlers
ipcMain.handle('show-welcome-windows', async (event, { firstName }) => {
  return await showWelcomeWindows(firstName || 'Guest');
});

ipcMain.handle('close-welcome-windows', async () => {
  return await closeWelcomeWindows();
});

// =====================================================
// NOTIFICATION POPUP
// =====================================================

let notificationWindow = null;

ipcMain.handle('show-notification-popup', async (event, { message, displayLabel, durationMs, extendUrl }) => {
  try {
    console.log(`Showing notification popup on display: ${displayLabel}, duration: ${durationMs}ms${extendUrl ? ', with extend QR' : ''}`);
    
    // Close existing notification if any
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
      notificationWindow = null;
    }
    
    // Find the target display by label
    const displays = screen.getAllDisplays();
    let targetDisplay = displays[0]; // Default to primary
    
    for (const display of displays) {
      const label = display.label || `Display ${displays.indexOf(display) + 1}`;
      if (label === displayLabel) {
        targetDisplay = display;
        break;
      }
    }
    
    const { x, y, width, height } = targetDisplay.bounds;
    
    // Wider/taller when we render the QR
    const hasQr = !!extendUrl;
    const popupWidth = hasQr ? 640 : 500;
    const popupHeight = hasQr ? 280 : 200;
    const margin = 40;
    const popupX = x + width - popupWidth - margin;
    const popupY = y + height - popupHeight - margin;
    
    notificationWindow = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x: popupX,
      y: popupY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    notificationWindow.setAlwaysOnTop(true, 'screen-saver');
    
    const safeMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const qrSrc = hasQr
      ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(extendUrl)}`
      : '';
    
    const qrBlock = hasQr ? `
      <div class="qr-block">
        <img class="qr" src="${qrSrc}" alt="Extend booking QR" />
        <div class="qr-caption">Scan to extend<br/>your session</div>
      </div>
    ` : '';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            padding: 20px;
          }
          .notification {
            background: linear-gradient(135deg, #b5772a, #d55627);
            color: white;
            padding: 24px 28px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            max-width: 100%;
            width: 100%;
            display: flex;
            align-items: center;
            gap: 20px;
            animation: slideIn 0.3s ease-out;
          }
          .content { flex: 1; text-align: ${hasQr ? 'left' : 'center'}; }
          @keyframes slideIn {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: ${hasQr ? 'flex-start' : 'center'};
            gap: 10px;
          }
          .message { font-size: 20px; font-weight: 500; line-height: 1.4; }
          .bell-icon { width: 24px; height: 24px; }
          .qr-block {
            background: white;
            border-radius: 12px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
          }
          .qr { width: 180px; height: 180px; display: block; }
          .qr-caption { color: #2F3134; font-size: 12px; font-weight: 600; text-align: center; line-height: 1.2; }
        </style>
      </head>
      <body>
        <div class="notification">
          <div class="content">
            <div class="title">
              <svg class="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              Session Ending Soon
            </div>
            <div class="message">${safeMessage}</div>
          </div>
          ${qrBlock}
        </div>
      </body>
      </html>
    `;
    
    notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    // Auto-close after duration (use provided duration or default to 60 seconds)
    const duration = durationMs || 60000;
    setTimeout(() => {
      if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.close();
        notificationWindow = null;
      }
    }, duration);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show notification popup:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-notification-popup', async () => {
  try {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
      notificationWindow = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// =====================================================
// SGT ICON OVERLAY WINDOW
// =====================================================

let sgtIconWindow = null;
let sgtInfoWindow = null;
let currentSgtDisplayLabel = null;
let currentSgtDisplayId = null;
let currentSgtPosition = null;
let sgtPlayerData = null; // Store player data for info window

// Read the SGT icon for use in the overlay
function getSgtIconBase64() {
  try {
    // Try to find sgt-icon.png in the app directory
    const possiblePaths = [
      path.join(__dirname, 'sgt-icon.png'),
      path.join(process.resourcesPath || '', 'sgt-icon.png'),
      path.join(app.getAppPath(), 'sgt-icon.png'),
    ];
    
    for (const iconPath of possiblePaths) {
      if (fs.existsSync(iconPath)) {
        const buffer = fs.readFileSync(iconPath);
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }
    }
    console.log('SGT icon not found, using fallback');
    return null;
  } catch (err) {
    console.error('Failed to load SGT icon:', err);
    return null;
  }
}

// Helper function to find display by label - shared by all SGT windows
function findDisplayByLabel(displayLabel) {
  const displays = screen.getAllDisplays();
  let targetDisplay = displays[0]; // Default to primary
  
  console.log(`[SGT Display Lookup] Looking for: "${displayLabel}"`);
  console.log(`[SGT Display Lookup] Available displays:`);
  displays.forEach((d, i) => {
    const label = d.label || `Display ${i + 1}`;
    console.log(`  - "${label}" at ${d.bounds.x},${d.bounds.y}`);
  });
  
  for (const display of displays) {
    const label = display.label || `Display ${displays.indexOf(display) + 1}`;
    if (label === displayLabel) {
      targetDisplay = display;
      console.log(`[SGT Display Lookup] Found match: "${label}"`);
      break;
    }
  }
  
  console.log(`[SGT Display Lookup] Using display at: ${targetDisplay.bounds.x},${targetDisplay.bounds.y}`);
  return targetDisplay;
}

// Show the SGT info overlay window on the configured display
async function showSgtInfoOverlay(displayLabel) {
  try {
    // Use stored display label if none provided
    const effectiveDisplayLabel = displayLabel || currentSgtDisplayLabel;
    console.log('Showing SGT info overlay on display:', effectiveDisplayLabel);
    
    // Close existing if any
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.close();
      sgtInfoWindow = null;
    }
    
    // Find the target display by label using shared helper
    const targetDisplay = findDisplayByLabel(effectiveDisplayLabel);
    
    const { x, y, width, height } = targetDisplay.bounds;
    
    // Compact overlay docked to the top-right so it never blocks the GSPro
    // player name / UID fields in the centre of the screen.
    const overlayWidth = 340;
    const overlayHeight = 520;
    const margin = 20;
    const overlayX = x + width - overlayWidth - margin;
    const overlayY = y + margin;
    
    sgtInfoWindow = new BrowserWindow({
      width: overlayWidth,
      height: overlayHeight,
      x: overlayX,
      y: overlayY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // Set always on top with screen-saver level to appear above fullscreen apps
    sgtInfoWindow.setAlwaysOnTop(true, 'screen-saver');
    sgtInfoWindow.setVisibleOnAllWorkspaces(true);

    // Re-assert always-on-top whenever focus shifts away (e.g. user clicks
    // into GSPro to paste). Without this, GSPro fullscreen can occasionally
    // steal the topmost slot and bury the SGT info window.
    sgtInfoWindow.on('blur', () => {
      if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
        sgtInfoWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    });
    
    const iconBase64 = getSgtIconBase64();
    const playerData = sgtPlayerData || { customerName: 'Guest', sgtUsername: '', sgtGameId: '' };
    
    // Generate HTML for the SGT info overlay
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            background: transparent;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          }
          .overlay {
            background: white;
            border-radius: 14px;
            box-shadow: 0 16px 50px rgba(0,0,0,0.3);
            padding: 16px;
            -webkit-app-region: drag;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
          }
          .title-row {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .logo {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            object-fit: cover;
          }
          .title {
            font-size: 15px;
            font-weight: 700;
            color: #2f3134;
          }
          .close-btn {
            -webkit-app-region: no-drag;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: none;
            background: #f0f0f0;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          }
          .close-btn:hover {
            background: #dc3545;
            color: white;
          }
          .content {
            -webkit-app-region: no-drag;
          }
          .customer-name {
            font-size: 16px;
            font-weight: 600;
            color: #2f3134;
            margin-bottom: 10px;
          }
          .field {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 10px 12px;
            margin-bottom: 8px;
          }
          .field-label {
            font-size: 10px;
            font-weight: 600;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .field-value {
            font-size: 14px;
            font-weight: 500;
            color: #212529;
            font-family: monospace;
            word-break: break-all;
            margin-bottom: 8px;
          }
          .action-btns {
            display: flex;
            gap: 6px;
          }
          .copy-btn, .paste-btn {
            -webkit-app-region: no-drag;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            flex: 1;
          }
          .copy-btn { background: #2f3134; }
          .copy-btn:hover { background: #2d6a34; }
          .paste-btn { background: #b5772a; }
          .paste-btn:hover { background: #d55627; }
          .paste-btn.pasting { background: #28a745; }
          .copy-btn.copied, .paste-btn.pasted { background: #28a745; }
          .instructions {
            margin-top: 10px;
            padding: 10px 12px;
            background: #e8f4fd;
            border-radius: 8px;
            font-size: 11.5px;
            color: #2f3134;
            line-height: 1.5;
          }
          .instructions-title {
            font-weight: 700;
            margin-bottom: 6px;
            color: #2f3134;
          }
          .instructions ol {
            margin: 0;
            padding-left: 18px;
          }
          .instructions li {
            margin-bottom: 3px;
          }
          .instructions strong { color: #b5772a; }
          .tip {
            margin-top: 8px;
            padding: 8px 10px;
            background: #f5f3ef;
            border-radius: 6px;
            font-size: 11px;
            color: #2f3134;
            text-align: center;
          }
          .tip strong { color: #b5772a; }
        </style>
      </head>
      <body>
        <div class="overlay">
          <div class="header">
            <div class="title-row">
              ${iconBase64 ? `<img src="${iconBase64}" class="logo" alt="SGT" />` : ''}
              <span class="title">SGT Player Info</span>
            </div>
            <button class="close-btn" onclick="window.electronAPI.closeSgtInfoOverlay()" title="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="content">
            <div class="customer-name">${escapeHtml(playerData.customerName || 'Guest')}</div>

            <div class="field">
              <div class="field-label">SGT Username</div>
              <div class="field-value" id="username">${escapeHtml(playerData.sgtUsername || 'Not set')}</div>
              ${playerData.sgtUsername ? `<div class="action-btns">
                <button class="copy-btn" onclick="copyField('${escapeHtml(playerData.sgtUsername)}', this)">Copy</button>
                <button class="paste-btn" onclick="pasteField('${escapeHtml(playerData.sgtUsername)}', this)">Paste</button>
              </div>` : ''}
            </div>

            <div class="field">
              <div class="field-label">Simulator Golf Tour ID (UID)</div>
              <div class="field-value" id="gameid">${escapeHtml(playerData.sgtGameId || 'Not set')}</div>
              ${playerData.sgtGameId ? `<div class="action-btns">
                <button class="copy-btn" onclick="copyField('${escapeHtml(playerData.sgtGameId)}', this)">Copy</button>
                <button class="paste-btn" onclick="pasteField('${escapeHtml(playerData.sgtGameId)}', this)">Paste</button>
              </div>` : ''}
            </div>

            <div class="instructions">
              <div class="instructions-title">Instructions</div>
              <ol>
                <li>Go to <strong>Settings / Players</strong></li>
                <li>Add a new player or edit a guest</li>
                <li>Click <strong>Copy Username</strong>, paste into the Player Name field</li>
                <li>Click <strong>Copy UID</strong>, paste into the UID field</li>
                <li>Click <strong>Save</strong> and head to <strong>Sim Tournaments</strong> to load your league rounds</li>
              </ol>
            </div>

            <div class="tip"><strong>F7</strong> toggles this window</div>
          </div>
        </div>
        </div>
        
        <script>
          function copyField(value, btn) {
            navigator.clipboard.writeText(value).then(() => {
              btn.textContent = 'Copied!';
              btn.classList.add('copied');
              setTimeout(() => {
                btn.textContent = 'Copy';
                btn.classList.remove('copied');
              }, 2000);
            });
          }
          
          async function pasteField(value, btn) {
            btn.textContent = 'Pasting...';
            btn.classList.add('pasting');
            
            try {
              // Copy to clipboard and trigger auto-paste
              await window.electronAPI.copyForPaste(value);
              
              // Brief delay to let our window lose focus
              setTimeout(async () => {
                await window.electronAPI.triggerAutoPaste();
                btn.textContent = 'Pasted!';
                btn.classList.remove('pasting');
                btn.classList.add('pasted');
                setTimeout(() => {
                  btn.textContent = 'Paste';
                  btn.classList.remove('pasted');
                }, 2000);
              }, 150);
            } catch (err) {
              console.error('Paste failed:', err);
              btn.textContent = 'Paste';
              btn.classList.remove('pasting');
            }
          }
        </script>
      </body>
      </html>
    `;
    
    sgtInfoWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show SGT info overlay:', error);
    return { success: false, error: error.message };
  }
}

// Helper to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Separate confirmation popup window for hiding the SGT icon
let sgtConfirmWindow = null;

// Show confirmation dialog in a separate centered popup
async function showSgtHideConfirmation(displayLabel) {
  try {
    // Close existing if any
    if (sgtConfirmWindow && !sgtConfirmWindow.isDestroyed()) {
      sgtConfirmWindow.close();
      sgtConfirmWindow = null;
    }
    
    // Use stored display label if none provided, use shared helper
    const effectiveDisplayLabel = displayLabel || currentSgtDisplayLabel;
    console.log('Showing SGT hide confirmation on display:', effectiveDisplayLabel);
    const targetDisplay = findDisplayByLabel(effectiveDisplayLabel);
    
    const { x, y, width, height } = targetDisplay.bounds;
    
    // Center the dialog on the display - taller to fit all content
    const dialogWidth = 400;
    const dialogHeight = 340;
    const dialogX = x + (width - dialogWidth) / 2;
    const dialogY = y + (height - dialogHeight) / 2;
    
    sgtConfirmWindow = new BrowserWindow({
      width: dialogWidth,
      height: dialogHeight,
      x: dialogX,
      y: dialogY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // Set always on top with screen-saver level to appear above fullscreen apps
    sgtConfirmWindow.setAlwaysOnTop(true, 'screen-saver');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            background: transparent;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            width: 100%;
            height: 100%;
          }
          .dialog {
            background: white;
            border-radius: 16px;
            padding: 28px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            text-align: center;
          }
          .title {
            font-size: 20px;
            font-weight: 600;
            color: #2f3134;
            margin-bottom: 16px;
          }
          .text {
            font-size: 15px;
            color: #6c757d;
            margin-bottom: 16px;
            line-height: 1.6;
          }
          .tip {
            font-size: 14px;
            color: #b5772a;
            margin-bottom: 24px;
            padding: 14px;
            background: #f5f3ef;
            border-radius: 10px;
            line-height: 1.5;
          }
          .buttons {
            display: flex;
            gap: 14px;
          }
          .btn {
            flex: 1;
            padding: 14px 20px;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            transition: all 0.2s;
          }
          .btn.cancel {
            background: #f0f0f0;
            color: #333;
          }
          .btn.cancel:hover {
            background: #e0e0e0;
          }
          .btn.confirm {
            background: #b5772a;
            color: white;
          }
          .btn.confirm:hover {
            background: #d55627;
          }
        </style>
      </head>
      <body>
        <div class="dialog">
          <div class="title">Hide SGT Icon?</div>
          <div class="text">The SGT icon will be hidden until a new booking with an SGT-linked account starts.</div>
          <div class="tip">💡 <strong>Tip:</strong> If you want to play your SGT tour round, press <strong>F7</strong> to open the SGT info window anytime.</div>
          <div class="buttons">
            <button class="btn cancel" onclick="window.electronAPI.cancelSgtHideConfirm()">Keep Showing</button>
            <button class="btn confirm" onclick="window.electronAPI.sgtIconHideConfirmed()">Hide Icon</button>
          </div>
        </div>
      </body>
      </html>
    `;
    
    sgtConfirmWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show SGT hide confirmation:', error);
    return { success: false, error: error.message };
  }
}

ipcMain.handle('show-sgt-icon-overlay', async (event, { displayLabel, position, playerData }) => {
  try {
    console.log(`Showing SGT icon overlay on display: ${displayLabel}, position: ${position}`);
    
    // Store display info for later use
    currentSgtDisplayLabel = displayLabel;
    currentSgtPosition = position;
    if (playerData) {
      sgtPlayerData = playerData;
    }
    
    // Close existing if any
    if (sgtIconWindow && !sgtIconWindow.isDestroyed()) {
      sgtIconWindow.close();
      sgtIconWindow = null;
    }
    
    // Use shared helper to find display
    console.log('Showing SGT icon overlay on display:', displayLabel);
    const targetDisplay = findDisplayByLabel(displayLabel);
    
    const { x, y, width, height } = targetDisplay.bounds;
    
    // Calculate position based on corner preference
    const iconSize = 90;
    const margin = 20;
    let iconX, iconY;
    
    switch (position) {
      case 'top-left':
        iconX = x + margin;
        iconY = y + margin;
        break;
      case 'top-right':
        iconX = x + width - iconSize - margin;
        iconY = y + margin;
        break;
      case 'bottom-left':
        iconX = x + margin;
        iconY = y + height - iconSize - margin;
        break;
      case 'bottom-right':
      default:
        iconX = x + width - iconSize - margin;
        iconY = y + height - iconSize - margin;
        break;
    }
    
    // Create frameless, always-on-top overlay (screen-saver level to appear above fullscreen apps)
    sgtIconWindow = new BrowserWindow({
      width: iconSize,
      height: iconSize,
      x: iconX,
      y: iconY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // Set always on top with screen-saver level to appear above fullscreen apps
    sgtIconWindow.setAlwaysOnTop(true, 'screen-saver');
    
    const iconBase64 = getSgtIconBase64();
    
    // Generate HTML for the SGT icon button with close button - NO INLINE DIALOG
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            background: transparent;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          .container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sgt-button {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: 3px solid rgba(236, 98, 45, 0.6);
            background: white;
            cursor: pointer;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sgt-button:hover {
            transform: scale(1.1);
            border-color: #b5772a;
            box-shadow: 0 6px 25px rgba(236, 98, 45, 0.4);
          }
          .sgt-button img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .sgt-button .fallback {
            font-size: 20px;
            font-weight: bold;
            color: #b5772a;
          }
          .close-btn {
            position: absolute;
            top: 2px;
            right: 2px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: none;
            background: #dc3545;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          }
          .container:hover .close-btn {
            opacity: 1;
          }
          .close-btn:hover {
            transform: scale(1.1);
            background: #c82333;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <button class="sgt-button" onclick="window.electronAPI.sgtIconClicked()" title="View SGT Player Info">
            ${iconBase64 
              ? `<img src="${iconBase64}" alt="SGT" />`
              : '<span class="fallback">SGT</span>'
            }
          </button>
          <button class="close-btn" onclick="window.electronAPI.showSgtHideConfirm()" title="Hide SGT icon">×</button>
        </div>
      </body>
      </html>
    `;
    
    sgtIconWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    // Allow window to receive mouse events
    sgtIconWindow.setIgnoreMouseEvents(false);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show SGT icon overlay:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-sgt-icon-overlay', async () => {
  try {
    if (sgtIconWindow && !sgtIconWindow.isDestroyed()) {
      sgtIconWindow.close();
      sgtIconWindow = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-sgt-info-overlay', async () => {
  try {
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.close();
      sgtInfoWindow = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-sgt-info-overlay', async (event, { displayLabel, playerData }) => {
  if (playerData) {
    sgtPlayerData = playerData;
  }
  return await showSgtInfoOverlay(displayLabel || currentSgtDisplayLabel);
});

ipcMain.handle('toggle-sgt-info-overlay', async () => {
  if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
    sgtInfoWindow.close();
    sgtInfoWindow = null;
    return { success: true, visible: false };
  } else {
    await showSgtInfoOverlay(currentSgtDisplayLabel);
    return { success: true, visible: true };
  }
});

ipcMain.handle('update-sgt-icon-position', async (event, { displayLabel, position }) => {
  // Close and reopen with new position
  if (sgtIconWindow && !sgtIconWindow.isDestroyed()) {
    sgtIconWindow.close();
    sgtIconWindow = null;
  }
  // Will be re-shown by the renderer if needed
  return { success: true };
});

// Handle showing the SGT hide confirmation dialog
ipcMain.on('show-sgt-hide-confirm', async () => {
  console.log('Showing SGT hide confirmation dialog');
  await showSgtHideConfirmation(currentSgtDisplayLabel);
});

// Handle cancelling the SGT hide confirmation dialog
ipcMain.on('cancel-sgt-hide-confirm', () => {
  console.log('SGT hide confirmation cancelled');
  if (sgtConfirmWindow && !sgtConfirmWindow.isDestroyed()) {
    sgtConfirmWindow.close();
    sgtConfirmWindow = null;
  }
});

// Handle SGT icon click from the overlay window - show info overlay
ipcMain.on('sgt-icon-clicked', async () => {
  console.log('SGT icon clicked in overlay window - showing info overlay');
  await showSgtInfoOverlay(currentSgtDisplayLabel);
  // Also notify main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sgt-icon-clicked');
  }
});

// Handle SGT icon hide confirmation from the overlay window
ipcMain.on('sgt-icon-hide-confirmed', () => {
  console.log('SGT icon hide confirmed - closing overlays and notifying main');
  // Close the confirmation dialog
  if (sgtConfirmWindow && !sgtConfirmWindow.isDestroyed()) {
    sgtConfirmWindow.close();
    sgtConfirmWindow = null;
  }
  // Close the icon overlay
  if (sgtIconWindow && !sgtIconWindow.isDestroyed()) {
    sgtIconWindow.close();
    sgtIconWindow = null;
  }
  // Close the info overlay
  if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
    sgtInfoWindow.close();
    sgtInfoWindow = null;
  }
  // Notify main window that icon was hidden
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sgt-icon-hidden');
  }
});

// =====================================================
// CLIPBOARD AND AUTO-PASTE
// =====================================================

// Copy text to clipboard and arm auto-paste
// When armed, the next simulated key sequence will do Ctrl+A, Delete, Ctrl+V
ipcMain.handle('copy-for-paste', async (event, { text }) => {
  try {
    clipboard.writeText(text);
    autoPasteEnabled = true;
    autoPasteText = text;
    console.log('Clipboard armed for auto-paste:', text);
    return { success: true };
  } catch (error) {
    console.error('Copy for paste failed:', error);
    return { success: false, error: error.message };
  }
});

// Trigger the auto-paste sequence: Ctrl+A, Delete, then Ctrl+V
// First hides the SGT info overlay and focuses GSPRO to ensure keystrokes go there
ipcMain.handle('trigger-auto-paste', async () => {
  try {
    if (!autoPasteEnabled || !autoPasteText) {
      return { success: false, error: 'Auto-paste not armed' };
    }
    
    console.log('Triggering auto-paste sequence...');
    
    // Hide the SGT info window temporarily (don't close, just blur/hide)
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.blur();
      // Temporarily set not always on top so focus can shift
      sgtInfoWindow.setAlwaysOnTop(false);
    }
    
    // Find and focus GSPRO window first
    const gsproWindow = await findGsproWindow();
    if (gsproWindow.success) {
      console.log('Focusing GSPRO window before paste...');
      await focusWindow(gsproWindow.hwnd);
      // Wait for focus to settle
      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      console.log('GSPRO window not found, proceeding with paste anyway...');
    }
    
    // Create a PowerShell script that sends Ctrl+A, then Delete, then Ctrl+V
    const tempScript = path.join(app.getPath('temp'), 'auto_paste.ps1');
    const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeyboardSender {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
    public const int KEYEVENTF_KEYUP = 0x02;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_A = 0x41;
    public const byte VK_V = 0x56;
    public const byte VK_DELETE = 0x2E;
    
    public static void SendCtrlA() {
        keybd_event(VK_CONTROL, 0, 0, IntPtr.Zero);
        keybd_event(VK_A, 0, 0, IntPtr.Zero);
        keybd_event(VK_A, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
    }
    
    public static void SendDelete() {
        keybd_event(VK_DELETE, 0, 0, IntPtr.Zero);
        keybd_event(VK_DELETE, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
    }
    
    public static void SendCtrlV() {
        keybd_event(VK_CONTROL, 0, 0, IntPtr.Zero);
        keybd_event(VK_V, 0, 0, IntPtr.Zero);
        keybd_event(VK_V, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
    }
}
"@
[KeyboardSender]::SendCtrlA()
Start-Sleep -Milliseconds 50
[KeyboardSender]::SendDelete()
Start-Sleep -Milliseconds 50
[KeyboardSender]::SendCtrlV()
Write-Output "done"
`;
    
    fs.writeFileSync(tempScript, scriptContent);
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 5000 });
    fs.unlinkSync(tempScript);
    
    // Restore SGT info window to always on top (screen-saver level so it stays
    // above GSPro fullscreen even after the user clicks back into the game).
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.setAlwaysOnTop(true, 'screen-saver');
      sgtInfoWindow.setVisibleOnAllWorkspaces(true);
    }
    
    // Disarm auto-paste after use
    autoPasteEnabled = false;
    autoPasteText = '';
    
    console.log('Auto-paste sequence completed');
    return { success: true };
  } catch (error) {
    console.error('Auto-paste failed:', error);
    // Restore always on top even on error
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    try { fs.unlinkSync(path.join(app.getPath('temp'), 'auto_paste.ps1')); } catch {}
    return { success: false, error: error.message };
  }
});

// Get current auto-paste status
ipcMain.handle('get-auto-paste-status', async () => {
  return { enabled: autoPasteEnabled, text: autoPasteText };
});

// Clear/disarm auto-paste
ipcMain.handle('clear-auto-paste', async () => {
  autoPasteEnabled = false;
  autoPasteText = '';
  clipboard.clear();
  return { success: true };
});

// =====================================================
// GSPRO BASELINE SETTINGS MANAGEMENT
// =====================================================

// Protee Labs config path (hardcoded per plan)
const PROTEE_CONFIG_PATH = 'C:\\Users\\Golf Sim\\AppData\\Roaming\\ProTeeUnited\\Configs\\Config';

// State for baseline settings
let baselineConfig = {
  gsproFolderPath: '', // C:\Users\<user>\AppData\Local\GSPro
  dpsFilePath: '',     // Full path to dpsV2x3.gss in GSPro folder
  settingsFilePath: '', // Full path to Settings.vgs in GSPro folder
  enabled: false,
  proteeDisplayLabel: '', // Friendly display name (e.g., "BenQ RE6504")
  proteeScreenId: '',     // Resolved \\?\DISPLAY#...  device path
};

// State for process monitoring
let gsproWatchInterval = null;
let gsproWasRunning = false;

// Get the app data folder for storing baseline files
function getBaselineStoragePath() {
  const userDataPath = app.getPath('userData');
  const baselinePath = path.join(userDataPath, 'gspro-baseline');
  
  // Create folder if it doesn't exist
  if (!fs.existsSync(baselinePath)) {
    fs.mkdirSync(baselinePath, { recursive: true });
  }
  
  return baselinePath;
}

// Load baseline config from storage
function loadBaselineConfig() {
  try {
    const configPath = path.join(getBaselineStoragePath(), 'config.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      baselineConfig = { ...baselineConfig, ...JSON.parse(data) };
      console.log('Loaded baseline config:', baselineConfig);
    }
  } catch (error) {
    console.error('Failed to load baseline config:', error);
  }
}

// Save baseline config to storage
function saveBaselineConfig() {
  try {
    const configPath = path.join(getBaselineStoragePath(), 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(baselineConfig, null, 2));
    console.log('Saved baseline config');
  } catch (error) {
    console.error('Failed to save baseline config:', error);
  }
}

// Check if GSPro is running
async function isGsproRunning() {
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq GSPro.exe" /NH', { timeout: 5000 });
    return stdout.toLowerCase().includes('gspro.exe');
  } catch {
    return false;
  }
}

// Restore baseline files to GSPro folder
async function restoreBaselineFiles() {
  const results = [];
  const storagePath = getBaselineStoragePath();
  
  console.log('=== RESTORING BASELINE FILES ===');
  
  // Restore dpsV2x3.gss
  const storedDpsPath = path.join(storagePath, 'dpsV2x3.gss');
  if (baselineConfig.dpsFilePath && fs.existsSync(storedDpsPath)) {
    try {
      fs.copyFileSync(storedDpsPath, baselineConfig.dpsFilePath);
      console.log('Restored dpsV2x3.gss to:', baselineConfig.dpsFilePath);
      results.push({ file: 'dpsV2x3.gss', success: true });
    } catch (error) {
      console.error('Failed to restore dpsV2x3.gss:', error);
      results.push({ file: 'dpsV2x3.gss', success: false, error: error.message });
    }
  } else {
    console.log('Skipping dpsV2x3.gss - not configured or baseline not found');
    results.push({ file: 'dpsV2x3.gss', success: false, error: 'Not configured' });
  }
  
  // Restore Settings.vgs
  const storedSettingsPath = path.join(storagePath, 'Settings.vgs');
  if (baselineConfig.settingsFilePath && fs.existsSync(storedSettingsPath)) {
    try {
      fs.copyFileSync(storedSettingsPath, baselineConfig.settingsFilePath);
      console.log('Restored Settings.vgs to:', baselineConfig.settingsFilePath);
      results.push({ file: 'Settings.vgs', success: true });
    } catch (error) {
      console.error('Failed to restore Settings.vgs:', error);
      results.push({ file: 'Settings.vgs', success: false, error: error.message });
    }
  } else {
    console.log('Skipping Settings.vgs - not configured or baseline not found');
    results.push({ file: 'Settings.vgs', success: false, error: 'Not configured' });
  }
  
  // Restore Protee Labs config (CurrentStartupScreen)
  if (baselineConfig.proteeScreenId) {
    try {
      if (fs.existsSync(PROTEE_CONFIG_PATH)) {
        let configContent = fs.readFileSync(PROTEE_CONFIG_PATH, 'utf-8');
        const regex = /^CurrentStartupScreen=.*$/m;
        if (regex.test(configContent)) {
          configContent = configContent.replace(regex, `CurrentStartupScreen=${baselineConfig.proteeScreenId}`);
        } else {
          // Append if not found
          configContent += `\nCurrentStartupScreen=${baselineConfig.proteeScreenId}`;
        }
        fs.writeFileSync(PROTEE_CONFIG_PATH, configContent);
        console.log('Restored Protee CurrentStartupScreen to:', baselineConfig.proteeScreenId);
        results.push({ file: 'Protee Config', success: true });
      } else {
        console.log('Protee config file not found at:', PROTEE_CONFIG_PATH);
        results.push({ file: 'Protee Config', success: false, error: 'Config file not found' });
      }
    } catch (error) {
      console.error('Failed to restore Protee config:', error);
      results.push({ file: 'Protee Config', success: false, error: error.message });
    }
  } else {
    console.log('Skipping Protee config restore - no screen ID configured');
  }
  
  // Clear Windows clipboard so leftover SGT credentials (or anything else)
  // from the previous customer can't be pasted by the next player.
  try {
    clipboard.clear();
    console.log('Cleared Windows clipboard');
    results.push({ file: 'Clipboard', success: true });
  } catch (error) {
    console.error('Failed to clear clipboard:', error);
    results.push({ file: 'Clipboard', success: false, error: error.message });
  }

  console.log('=== BASELINE RESTORE COMPLETE ===', results);
  return results;
}

// Get display device paths using PowerShell (maps friendly names to \\?\DISPLAY#... paths)
async function getDisplayDevicePaths() {
  try {
    const psCommand = `Get-PnpDevice -Class Monitor -Status OK | Select-Object InstanceId, FriendlyName | ConvertTo-Json`;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`, { timeout: 10000 });
    
    let devices = JSON.parse(stdout.trim());
    // Ensure array (single device returns object)
    if (!Array.isArray(devices)) devices = [devices];
    
    const MONITOR_GUID = '{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}';
    
    return devices
      .filter(d => d.InstanceId && d.FriendlyName)
      .map(d => ({
        label: d.FriendlyName,
        devicePath: `\\\\?\\${d.InstanceId.replace(/\\\\/g, '#')}#${MONITOR_GUID}`,
      }));
  } catch (error) {
    console.error('Failed to get display device paths:', error);
    return [];
  }
}

// Read current Protee config CurrentStartupScreen value
function readProteeCurrentScreen() {
  try {
    if (!fs.existsSync(PROTEE_CONFIG_PATH)) {
      return { success: false, error: 'Config file not found', path: PROTEE_CONFIG_PATH };
    }
    const content = fs.readFileSync(PROTEE_CONFIG_PATH, 'utf-8');
    const match = content.match(/^CurrentStartupScreen=(.*)$/m);
    return {
      success: true,
      currentScreen: match ? match[1] : '',
      path: PROTEE_CONFIG_PATH,
    };
  } catch (error) {
    return { success: false, error: error.message, path: PROTEE_CONFIG_PATH };
  }
}

// Start watching for GSPro process
function startGsproWatcher() {
  if (gsproWatchInterval) {
    console.log('GSPro watcher already running');
    return;
  }
  
  console.log('Starting GSPro process watcher...');
  
  gsproWatchInterval = setInterval(async () => {
    const isRunning = await isGsproRunning();
    
    // Detect when GSPro stops running
    if (gsproWasRunning && !isRunning) {
      console.log('GSPro process closed - notifying renderer (CSV sync only, no baseline restore)');

      // Notify renderer that GSPro closed (renderer uses this for range CSV upload).
      // NOTE: We deliberately DO NOT restore baseline on close any more. Per-customer
      // settings are captured at T-3min before session end; pre-launch is the only
      // place baseline/snapshot files are written.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gspro-closed');
      }
    }

    gsproWasRunning = isRunning;
  }, 3000); // Check every 3 seconds
}

// Stop watching for GSPro process
function stopGsproWatcher() {
  if (gsproWatchInterval) {
    clearInterval(gsproWatchInterval);
    gsproWatchInterval = null;
    gsproWasRunning = false;
    console.log('GSPro watcher stopped');
  }
}

// Load config on startup
loadBaselineConfig();

// IPC: Get baseline config
ipcMain.handle('get-baseline-config', async () => {
  const storagePath = getBaselineStoragePath();
  const hasDpsFile = fs.existsSync(path.join(storagePath, 'dpsV2x3.gss'));
  const hasSettingsFile = fs.existsSync(path.join(storagePath, 'Settings.vgs'));
  
  return {
    ...baselineConfig,
    hasDpsFile,
    hasSettingsFile,
    isWatching: !!gsproWatchInterval,
  };
});

// IPC: Get display device paths (friendly name -> device path mapping)
ipcMain.handle('get-display-device-paths', async () => {
  return await getDisplayDevicePaths();
});

// IPC: Set Protee display selection
ipcMain.handle('set-protee-display', async (event, { label, devicePath }) => {
  baselineConfig.proteeDisplayLabel = label;
  baselineConfig.proteeScreenId = devicePath;
  saveBaselineConfig();
  console.log('Saved Protee display:', label, '->', devicePath);
  return { success: true };
});

// IPC: Read current Protee config screen value
ipcMain.handle('read-protee-current-screen', async () => {
  return readProteeCurrentScreen();
});

// IPC: Set GSPro folder path
ipcMain.handle('set-gspro-folder', async (event, { folderPath }) => {
  try {
    // Validate the folder exists
    if (!fs.existsSync(folderPath)) {
      return { success: false, error: 'Folder does not exist' };
    }
    
    // Set the paths
    baselineConfig.gsproFolderPath = folderPath;
    baselineConfig.dpsFilePath = path.join(folderPath, 'dpsV2x3.gss');
    baselineConfig.settingsFilePath = path.join(folderPath, 'Settings.vgs');
    
    saveBaselineConfig();
    
    return { 
      success: true, 
      dpsFilePath: baselineConfig.dpsFilePath,
      settingsFilePath: baselineConfig.settingsFilePath,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Browse for GSPro folder
ipcMain.handle('browse-gspro-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select GSPro Data Folder',
      defaultPath: path.join(process.env.LOCALAPPDATA || '', 'GSPro'),
      properties: ['openDirectory'],
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    const folderPath = result.filePaths[0];
    
    // Set and save the config
    baselineConfig.gsproFolderPath = folderPath;
    baselineConfig.dpsFilePath = path.join(folderPath, 'dpsV2x3.gss');
    baselineConfig.settingsFilePath = path.join(folderPath, 'Settings.vgs');
    
    saveBaselineConfig();
    
    return { 
      success: true, 
      folderPath,
      dpsFilePath: baselineConfig.dpsFilePath,
      settingsFilePath: baselineConfig.settingsFilePath,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Upload baseline file (receive file content from renderer)
ipcMain.handle('save-baseline-file', async (event, { fileName, filePath }) => {
  try {
    const storagePath = getBaselineStoragePath();
    const destPath = path.join(storagePath, fileName);
    
    // Copy the file to our storage
    fs.copyFileSync(filePath, destPath);
    
    console.log(`Saved baseline file: ${fileName} from ${filePath}`);
    
    return { success: true, storedPath: destPath };
  } catch (error) {
    console.error('Failed to save baseline file:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Browse and upload a baseline file
ipcMain.handle('browse-baseline-file', async (event, { fileName }) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Select ${fileName} baseline file`,
      filters: [
        { name: 'GSPro Settings', extensions: ['gss', 'vgs'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile'],
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    const sourcePath = result.filePaths[0];
    const storagePath = getBaselineStoragePath();
    const destPath = path.join(storagePath, fileName);
    
    // Copy the file to our storage
    fs.copyFileSync(sourcePath, destPath);
    
    console.log(`Saved baseline file: ${fileName} from ${sourcePath}`);
    
    return { success: true, sourcePath, storedPath: destPath };
  } catch (error) {
    console.error('Failed to browse/save baseline file:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Enable/disable baseline restore
ipcMain.handle('set-baseline-enabled', async (event, { enabled }) => {
  baselineConfig.enabled = enabled;
  saveBaselineConfig();
  
  if (enabled) {
    startGsproWatcher();
  } else {
    // Keep the GSPro watcher running even when baseline restore is off.
    // Swing Lab settings/CSV sync depends on the same close event.
    startGsproWatcher();
  }
  
  return { success: true, enabled };
});

// IPC: Manually restore baseline files
ipcMain.handle('restore-baseline-now', async () => {
  try {
    const results = await restoreBaselineFiles();
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Check if GSPro is currently running
ipcMain.handle('is-gspro-running', async () => {
  const isRunning = await isGsproRunning();
  return { isRunning };
});

// Always start watcher on startup. Baseline restore is optional, but Swing Lab
// settings/CSV sync also depends on this close event.
startGsproWatcher();

// =====================================================
// DESKTOP CSV WATCHER
// Continuously watches the Windows Desktop for new .csv files (GSPro range exports)
// and pushes them to the renderer for immediate ingest. Uses fs.watch + a 2s
// stability delay so we never grab a half-written file.
// =====================================================
let desktopCsvWatcher = null;
const desktopCsvInFlight = new Set();       // filenames currently being processed
const desktopCsvRecentlyEmitted = new Map(); // filename -> ts (dedupe rapid events)

function scheduleDesktopCsvEmit(filename) {
  if (!filename || !filename.toLowerCase().endsWith('.csv')) return;
  if (desktopCsvInFlight.has(filename)) return;

  // Dedupe: fs.watch fires multiple events per file write; ignore if we started within 3s
  const recent = desktopCsvRecentlyEmitted.get(filename);
  if (recent && Date.now() - recent < 3000) return;
  desktopCsvRecentlyEmitted.set(filename, Date.now());

  desktopCsvInFlight.add(filename);
  const full = path.join(getDesktopPath(), filename);

  // Wait 2s, then verify file is stable (size unchanged for one more 500ms tick).
  setTimeout(async () => {
    try {
      if (!fs.existsSync(full)) { desktopCsvInFlight.delete(filename); return; }
      const s1 = fs.statSync(full);
      await new Promise(r => setTimeout(r, 500));
      if (!fs.existsSync(full)) { desktopCsvInFlight.delete(filename); return; }
      const s2 = fs.statSync(full);
      if (s1.size !== s2.size || s2.size === 0) {
        // Still being written — try again in 2s
        console.log(`[CSV-Watch] ${filename} still writing (size ${s1.size} -> ${s2.size}), retrying`);
        desktopCsvInFlight.delete(filename);
        desktopCsvRecentlyEmitted.delete(filename);
        scheduleDesktopCsvEmit(filename);
        return;
      }
      if (s2.size > 5 * 1024 * 1024) {
        console.warn(`[CSV-Watch] ${filename} too large (${s2.size} bytes), skipping`);
        desktopCsvInFlight.delete(filename);
        return;
      }
      const base64 = fs.readFileSync(full).toString('base64');
      console.log(`[CSV-Watch] Emitting ${filename} (${s2.size} bytes) to renderer`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop-csv-detected', {
          filename,
          base64,
          size: s2.size,
          mtime: s2.mtimeMs,
        });
      }
      // Renderer will call delete-desktop-csv after successful upload.
      // Clear from in-flight after a short grace so a re-export with same name later still works.
      setTimeout(() => desktopCsvInFlight.delete(filename), 30000);
    } catch (err) {
      console.error(`[CSV-Watch] Failed to process ${filename}:`, err.message);
      desktopCsvInFlight.delete(filename);
    }
  }, 2000);
}

function startDesktopCsvWatcher() {
  try {
    if (desktopCsvWatcher) return;
    const desk = getDesktopPath();
    if (!fs.existsSync(desk)) {
      console.warn(`[CSV-Watch] Desktop path missing: ${desk}`);
      return;
    }
    console.log(`[CSV-Watch] Starting watcher on ${desk}`);
    desktopCsvWatcher = fs.watch(desk, { persistent: true }, (eventType, filename) => {
      if (!filename) return;
      // fs.watch fires 'rename' for create/delete and 'change' for modify.
      // We schedule on any event; scheduleDesktopCsvEmit dedupes and verifies existence.
      if (filename.toLowerCase().endsWith('.csv')) {
        scheduleDesktopCsvEmit(filename);
      }
    });
    desktopCsvWatcher.on('error', (err) => {
      console.error('[CSV-Watch] Watcher error:', err.message);
    });

    // Also sweep any CSVs already sitting on the desktop at startup — they were
    // likely missed while the controller was offline.
    try {
      for (const name of fs.readdirSync(desk)) {
        if (name.toLowerCase().endsWith('.csv')) {
          console.log(`[CSV-Watch] Startup found existing ${name}, queueing`);
          scheduleDesktopCsvEmit(name);
        }
      }
    } catch {}
  } catch (err) {
    console.error('[CSV-Watch] Failed to start watcher:', err.message);
  }
}

app.whenReady().then(() => startDesktopCsvWatcher());

// =====================================================
// PER-CUSTOMER GSPRO SETTINGS + RANGE CSV FILE IPCs
// Renderer performs the network calls; main only does file I/O.
// =====================================================

const USER_SETTINGS_FILES = ['dpsV2x3.gss', 'Settings.vgs'];

function getDesktopPath() {
  try { return app.getPath('desktop'); }
  catch { return path.join(require('os').homedir(), 'Desktop'); }
}

function readFileBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}

// In-memory record of the files that were on disk immediately after we
// restored a specific user's snapshot. Used at close-time to detect whether
// the user actually saved any changes, and to attribute any changes back to
// the correct user even if the active booking has since changed (mid-session
// admin cancellation, back-to-back changeover, etc).
// Map key: bay folder path (single-bay app, but keyed for safety). Value:
// { userId, hashes: {file: sha256}, capturedAt }
const sessionSettingsSnapshots = new Map();

function hashFileSync(filePath) {
  const crypto = require('crypto');
  const buf = fs.readFileSync(filePath);
  return { hash: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
}

// Called by renderer immediately AFTER restoreUserGsproSettings completes.
// Records the on-disk hash of each settings file so we know what "no changes"
// looks like for this specific user's session.
ipcMain.handle('capture-user-settings-snapshot', async (_e, { userId } = {}) => {
  try {
    if (!baselineConfig.gsproFolderPath) return { success: false, error: 'GSPro folder not configured' };
    if (!userId) return { success: false, error: 'missing_user_id' };
    const hashes = {};
    for (const name of USER_SETTINGS_FILES) {
      const p = path.join(baselineConfig.gsproFolderPath, name);
      if (!fs.existsSync(p)) continue;
      try { hashes[name] = hashFileSync(p).hash; } catch (e) { /* ignore individual read failure */ }
    }
    sessionSettingsSnapshots.set(baselineConfig.gsproFolderPath, {
      userId,
      hashes,
      capturedAt: Date.now(),
    });
    console.log(`[Settings] Captured session-start snapshot for user ${userId}: ${Object.keys(hashes).join(', ') || '(none)'}`);
    return { success: true, files: Object.keys(hashes) };
  } catch (error) {
    console.error('[Settings] capture-user-settings-snapshot failed:', error);
    return { success: false, error: error.message };
  }
});

// Read current GSPro user settings files (returns base64 for each present file).
// Uses the session-start snapshot (captured just after per-user restore) to:
//   1. Skip any file that is byte-identical to what we restored (no user save).
//   2. Return the userId whose files these actually are, so uploads get
//      attributed correctly even if the active booking changed since launch.
// Falls back to baseline-hash compare if no session-start snapshot exists.
ipcMain.handle('read-gspro-user-settings', async () => {
  try {
    if (!baselineConfig.gsproFolderPath) return { success: false, error: 'GSPro folder not configured' };
    const sessionSnap = sessionSettingsSnapshots.get(baselineConfig.gsproFolderPath) || null;
    const files = {};
    // Always return every file that exists on disk. No hash-comparison, no skip
    // logic — the caller wants the customer's LATEST bytes every time so that
    // even a "no-change" session refreshes their stored snapshot.
    for (const name of USER_SETTINGS_FILES) {
      const p = path.join(baselineConfig.gsproFolderPath, name);
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      files[name] = buf.toString('base64');
    }
    return {
      success: true,
      files,
      skipped: [],
      restoredForUserId: sessionSnap?.userId ?? null,
      snapshotCapturedAt: sessionSnap?.capturedAt ?? null,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Write GSPro user settings files (base64 map: { 'dpsV2x3.gss': '...', 'Settings.vgs': '...' })
ipcMain.handle('write-gspro-user-settings', async (_e, { files } = {}) => {
  try {
    if (!baselineConfig.gsproFolderPath) return { success: false, error: 'GSPro folder not configured' };
    if (!files || typeof files !== 'object') return { success: false, error: 'No files provided' };
    const written = [];
    for (const name of USER_SETTINGS_FILES) {
      if (typeof files[name] !== 'string') continue;
      const p = path.join(baselineConfig.gsproFolderPath, name);
      fs.writeFileSync(p, Buffer.from(files[name], 'base64'));
      written.push(name);
    }
    console.log('[Range] Wrote user GSPro settings:', written);
    return { success: true, written };
  } catch (error) {
    console.error('[Range] write-gspro-user-settings failed:', error);
    return { success: false, error: error.message };
  }
});

// Return the timestamp GSPro was last launched by our automation (ms since epoch, or null)
ipcMain.handle('get-gspro-launch-ts', async () => {
  return { ts: global.__gsproLaunchTs || null };
});

// Scan desktop for CSV files (optionally newer than sinceMs). Returns [{filename, base64, mtime}]
ipcMain.handle('scan-desktop-csvs', async (_e, { sinceMs } = {}) => {
  try {
    const desk = getDesktopPath();
    console.log(`[Range] scan-desktop-csvs desktop=${desk} sinceMs=${sinceMs ?? 'none'}`);
    if (!fs.existsSync(desk)) {
      console.error(`[Range] Desktop path does not exist: ${desk}`);
      return { success: false, error: `Desktop path not found: ${desk}`, csvs: [], desktopPath: desk };
    }
    const entries = fs.readdirSync(desk);
    const allCsvNames = entries.filter(n => n.toLowerCase().endsWith('.csv'));
    console.log(`[Range] Found ${allCsvNames.length} CSV(s) on desktop total: ${allCsvNames.join(', ') || '(none)'}`);
    const csvs = [];
    const rejected = [];
    for (const name of entries) {
      if (!name.toLowerCase().endsWith('.csv')) continue;
      const full = path.join(desk, name);
      let stat;
      try { stat = fs.statSync(full); } catch (err) { rejected.push(`${name}: stat error`); continue; }
      if (!stat.isFile()) { rejected.push(`${name}: not a file`); continue; }
      if (sinceMs && stat.mtimeMs < sinceMs) {
        rejected.push(`${name}: mtime ${new Date(stat.mtimeMs).toISOString()} older than launch ${new Date(sinceMs).toISOString()}`);
        continue;
      }
      if (stat.size > 5 * 1024 * 1024) { rejected.push(`${name}: too large (${stat.size} bytes)`); continue; }
      const content = fs.readFileSync(full);
      csvs.push({
        filename: name,
        base64: content.toString('base64'),
        mtime: stat.mtimeMs,
        size: stat.size,
      });
    }
    if (rejected.length) console.log(`[Range] Rejected ${rejected.length} CSV(s): ${rejected.join(' | ')}`);
    console.log(`[Range] Returning ${csvs.length} CSV(s) after filter`);
    return { success: true, csvs, desktopPath: desk, totalCsvOnDesktop: allCsvNames.length, rejectedReasons: rejected };
  } catch (error) {
    console.error('[Range] scan-desktop-csvs failed:', error);
    return { success: false, error: error.message, csvs: [] };
  }
});

// =====================================================
// OBS RECORDING (League Highlights pilot)
// =====================================================
// Requires OBS Studio 28+ with obs-websocket 5 enabled on 127.0.0.1:4455.
// Renderer configures URL+password, starts/stops recording, and provides a
// signed upload URL. Main uploads the resulting .mkv directly (avoids
// shipping 1-5 GB files through IPC as base64).
let obsController = null;
function ensureObs({ url, password }) {
  try {
    const { OBSController } = require('./obs-controller');
    if (!obsController) obsController = new OBSController({ url, password });
    else { obsController.url = url; obsController.password = password; }
    return obsController;
  } catch (e) {
    console.error('[OBS] Failed to load obs-controller:', e.message);
    throw e;
  }
}

ipcMain.handle('obs-configure', async (_e, { url, password } = {}) => {
  try {
    ensureObs({ url: url || 'ws://127.0.0.1:4455', password: password || '' });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('obs-start-recording', async (_e, { url, password } = {}) => {
  try {
    const ctl = ensureObs({ url: url || 'ws://127.0.0.1:4455', password: password || '' });
    if (!ctl.identified) await ctl.connect();
    const status = await ctl.getStatus();
    if (status?.outputActive) {
      // outputDuration is milliseconds of the in-progress recording.
      const runningMs = Number(status.outputDuration || 0);
      const STALE_MS = 5 * 60 * 1000; // >5 min = stray recording left running
      if (runningMs < STALE_MS) {
        console.log(`[OBS] Recording already active (${Math.round(runningMs / 1000)}s), reusing`);
        return { success: true, startedAtMs: Date.now() - runningMs, alreadyRecording: true };
      }
      // Stray/orphaned recording (e.g. never stopped after a previous session).
      // Stop it, bin the file, then start a clean recording for this session.
      console.warn(`[OBS] Stray recording detected (${Math.round(runningMs / 60000)} min) - discarding`);
      try {
        const stale = await ctl.stopRecording();
        const strayPath = stale?.outputPath || null;
        if (strayPath) {
          await new Promise((r) => setTimeout(r, 1500));
          for (const p of [strayPath, strayPath.replace(/\.mkv$/i, '.mp4')]) {
            try { if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`[OBS] Deleted stray file ${p}`); } } catch (err) { console.warn('[OBS] Could not delete stray file:', err.message); }
          }
        }
      } catch (err) {
        console.error('[OBS] Failed to stop stray recording:', err.message);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    await ctl.startRecording();
    const startedAtMs = Date.now();
    console.log(`[OBS] Recording started at ${new Date(startedAtMs).toISOString()}`);
    return { success: true, startedAtMs };
  } catch (e) {
    console.error('[OBS] start failed:', e.message);
    return { success: false, error: e.message };
  }
});

// Polls a file until its size stops changing. OBS records direct-to-MP4, and
// StopRecord returns *before* the moov atom and trailing buffers are flushed to
// disk, so the size read at stop is routinely smaller than the finished file.
async function waitForStableSize(filePath, { timeoutMs = 60000, quietMs = 1500 } = {}) {
  let last = -1;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let size = 0;
    try { size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0; } catch {}
    if (size > 0 && size === last) return size;
    last = size;
    await new Promise((r) => setTimeout(r, quietMs));
  }
  console.warn(`[OBS] File size never settled within ${timeoutMs}ms: ${filePath} (${last} bytes)`);
  return last > 0 ? last : null;
}

ipcMain.handle('obs-stop-recording', async () => {
  try {
    if (!obsController || !obsController.identified) {
      return { success: false, error: 'OBS not connected' };
    }
    const res = await obsController.stopRecording();
    // v5 protocol returns outputPath in responseData. OBS is configured to record
    // direct to MP4, so this is the final file — no remux sibling to wait for.
    const filePath = res?.outputPath || null;
    if (!filePath) return { success: false, error: 'OBS returned no output path' };

    if (!filePath.toLowerCase().endsWith('.mp4')) {
      console.warn(`[OBS] Expected a direct MP4 recording, got: ${filePath}`);
    }

    // Wait for the file to finish finalising before reporting a size.
    const sizeBytes = await waitForStableSize(filePath);

    console.log(`[OBS] Recording stopped: ${filePath} (${sizeBytes} bytes)`);
    return { success: true, filePath, sizeBytes, mkvPath: null };
  } catch (e) {
    console.error('[OBS] stop failed:', e.message);
    return { success: false, error: e.message };
  }
});


ipcMain.handle('obs-get-status', async () => {
  try {
    if (!obsController || !obsController.identified) return { success: true, connected: false, recording: false };
    const s = await obsController.getStatus();
    return { success: true, connected: true, recording: !!s?.outputActive, timecode: s?.outputTimecode };
  } catch (e) { return { success: false, error: e.message }; }
});

// Inject an OBS chapter marker mid-recording (e.g. "Hole 7").
// Silently no-ops if OBS is not connected or the running recording isn't active.
ipcMain.handle('obs-add-chapter', async (_e, { name } = {}) => {
  try {
    if (!obsController || !obsController.identified) {
      return { success: false, error: 'OBS not connected' };
    }
    const status = await obsController.getStatus().catch(() => null);
    if (!status?.outputActive) return { success: false, error: 'not recording' };
    await obsController.addChapter(name || 'Chapter');
    console.log(`[OBS] Chapter marker inserted: ${name}`);
    return { success: true };
  } catch (e) {
    console.error('[OBS] addChapter failed:', e.message);
    return { success: false, error: e.message };
  }
});

// Upload a local file (e.g. OBS recording) to a Supabase signed upload URL.
// Streams the file so we don't blow renderer memory on multi-GB captures.
// Direct-to-Cloudflare Stream upload using the tus resumable protocol.
// Streams the file in 200 MiB chunks so multi-GB rounds never hit Supabase
// Storage's 2 GiB object cap and never load fully into memory.
// Returns a *stable* file size — polls until the size stops changing so we never
// declare an Upload-Length while OBS is still remuxing/flushing the file.
ipcMain.handle('obs-file-size', async (_e, { filePath } = {}) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { success: false, error: 'File not found' };
    const sizeBytes = await waitForStableSize(filePath);
    if (!sizeBytes) return { success: false, error: 'File is empty' };
    return { success: true, sizeBytes };
  } catch (e) {
    return { success: false, error: e.message };
  }
});


ipcMain.handle('obs-tus-upload', async (event, { filePath, uploadUrl, declaredSize } = {}) => {
  // 100 MiB chunks: multiple of 256 KiB and well under Cloudflare's 200 MB
  // per-PATCH ceiling, which we were hitting exactly and occasionally 400ing on.
  const CHUNK = 100 * 1024 * 1024;

  try {
    if (!filePath || !fs.existsSync(filePath)) return { success: false, error: 'File not found' };
    if (!uploadUrl) return { success: false, error: 'Missing uploadUrl' };

    const actual = fs.statSync(filePath).size;
    // Cloudflare rejects a final PATCH that isn't 256KiB-aligned unless it exactly
    // completes the declared Upload-Length. If the file grew after the URL was
    // minted (late remux flush), upload exactly the declared byte count.
    const total = Number.isFinite(declaredSize) && declaredSize > 0 ? Math.min(declaredSize, actual) : actual;
    if (Number.isFinite(declaredSize) && declaredSize > 0 && declaredSize !== actual) {
      console.warn(`[OBS] tus size mismatch: declared ${declaredSize}, on-disk ${actual} — uploading ${total} bytes`);
    }
    if (Number.isFinite(declaredSize) && declaredSize > actual) {
      return { success: false, error: `File smaller than declared upload length (${actual} < ${declaredSize})` };
    }
    let offset = 0;
    let consecutiveFailures = 0;


    const readChunk = (start, end) => new Promise((resolve, reject) => {
      const parts = [];
      const rs = fs.createReadStream(filePath, { start, end: end - 1 });
      rs.on('data', (d) => parts.push(d));
      rs.on('end', () => resolve(Buffer.concat(parts)));
      rs.on('error', reject);
    });

    while (offset < total) {
      const end = Math.min(offset + CHUNK, total);
      const buf = await readChunk(offset, end);
      try {
        const resp = await fetch(uploadUrl, {
          method: 'PATCH',
          headers: {
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
            'Content-Length': String(buf.length),
          },
          body: buf,
        });
        if (resp.status !== 204 && resp.status !== 200) {
          let detail = '';
          try { detail = (await resp.text()).slice(0, 300); } catch { /* ignore */ }
          throw new Error(`tus PATCH HTTP ${resp.status}${detail ? ` - ${detail}` : ''}`);
        }

        const newOffset = Number(resp.headers.get('upload-offset'));
        offset = Number.isFinite(newOffset) && newOffset > offset ? newOffset : end;
        consecutiveFailures = 0;
        console.log(`[OBS] tus progress ${Math.round((offset / total) * 100)}% (${offset}/${total})`);
        try { event.sender.send('obs-tus-progress', { filePath, offset, total }); } catch {}
      } catch (e) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 4) {
          return { success: false, error: `tus upload failed at ${offset}/${total}: ${e.message}` };
        }
        // Re-sync the server offset and retry this chunk.
        try {
          const head = await fetch(uploadUrl, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' } });
          const serverOffset = Number(head.headers.get('upload-offset'));
          if (Number.isFinite(serverOffset)) offset = serverOffset;
        } catch { /* keep local offset */ }
        await new Promise((r) => setTimeout(r, 2000 * consecutiveFailures));
      }
    }

    console.log(`[OBS] tus upload complete: ${filePath} (${total} bytes)`);
    return { success: true, sizeBytes: total };
  } catch (e) {
    console.error('[OBS] tus upload failed:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('obs-upload-file', async (_e, { filePath, signedUrl, contentType } = {}) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { success: false, error: 'File not found' };
    if (!signedUrl) return { success: false, error: 'Missing signedUrl' };
    const stat = fs.statSync(filePath);
    const buf = fs.readFileSync(filePath);
    const isMp4 = filePath.toLowerCase().endsWith('.mp4');
    const resolvedType = contentType || (isMp4 ? 'video/mp4' : 'video/x-matroska');
    const resp = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': resolvedType,
        'Content-Length': String(stat.size),
      },
      body: buf,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return { success: false, error: `Upload HTTP ${resp.status}: ${txt.slice(0, 200)}` };
    }
    console.log(`[OBS] Uploaded ${filePath} (${stat.size} bytes) → ${signedUrl.split('?')[0]}`);
    return { success: true, sizeBytes: stat.size };
  } catch (e) {
    console.error('[OBS] upload failed:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('obs-delete-file', async (_e, { filePath } = {}) => {
  try {
    if (!filePath) return { success: false, error: 'Missing path' };
    if (!fs.existsSync(filePath)) return { success: true, alreadyGone: true };
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// Delete a CSV file from the desktop by filename (safety: filename must not contain path separators)
ipcMain.handle('delete-desktop-csv', async (_e, { filename } = {}) => {
  try {
    if (!filename || typeof filename !== 'string') return { success: false, error: 'No filename' };
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return { success: false, error: 'Invalid filename' };
    }
    if (!filename.toLowerCase().endsWith('.csv')) return { success: false, error: 'Not a CSV' };
    const full = path.join(getDesktopPath(), filename);
    if (!fs.existsSync(full)) return { success: false, error: 'Not found' };
    fs.unlinkSync(full);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
