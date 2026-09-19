# 12 — Bay Controller: Silent Crash Recovery & Single-Instance Guard

**Portable handover document.** This is the complete, proven system that keeps the Bay
Controller running 24/7 on each bay PC: if the app crashes or is killed, it relaunches
within ~60 seconds, with **zero screen flicker, zero focus stealing, and no possibility
of two instances running at once**. Copy this whole setup to any new venue and only
rename the strings noted at the bottom.

## The four pieces

### 1. Single-instance lock — `electron/main.js` (top of file)

Electron's built-in mutex. Must run before anything else, including window creation.

```js
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running - quit immediately
  app.quit();
} else {
  app.on('second-instance', () => {
    // The watchdog or startup shortcut fired while we are already running.
    // CRITICAL: do nothing here. Do NOT focus/restore the window — that would
    // steal focus from the golf simulator. Stay silent in the tray.
  });
}
```

Key lessons baked in:
- The watchdog fires every minute; without this lock you'd get stacked instances and
  duplicated automation actions (double plug toggles, double app launches).
- The `second-instance` handler is intentionally empty — the default Electron pattern of
  "focus the existing window" is wrong here because the app lives in the tray and the
  customer is mid-swing in GSPro.

### 2. Silent watchdog scripts — `electron/watchdog.bat` + `electron/watchdog.vbs`

**The problem they solve:** Windows Task Scheduler running a `.bat` directly opens a
visible console window for a split second — every minute — which steals focus and flashes
over the simulator. The fix is a two-file sandwich: Task Scheduler → `wscript.exe` (no
window at all) → `watchdog.vbs` → `watchdog.bat` (launched hidden, window style 0).

`watchdog.vbs` (the entry point Task Scheduler calls):

```vbs
Dim sh, fso, here
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
' Window style 0 = fully hidden, False = don't wait
sh.Run """" & here & "\watchdog.bat""", 0, False
```

`watchdog.bat` (one check per run; Task Scheduler handles the repeat):

```bat
@echo off
setlocal enabledelayedexpansion
set "PROCESS_NAME=UF Bay Controller.exe"   :: rename per venue
set "APP_PATH="

:: Resolve the exe at runtime — NEVER hardcode a Windows username.
:: Probe order: installing user's LOCALAPPDATA, Program Files, then every profile.
if exist "%LOCALAPPDATA%\Programs\UF Bay Controller\%PROCESS_NAME%" set "APP_PATH=%LOCALAPPDATA%\Programs\UF Bay Controller\%PROCESS_NAME%"
if not defined APP_PATH if exist "%ProgramFiles%\UF Bay Controller\%PROCESS_NAME%" set "APP_PATH=%ProgramFiles%\UF Bay Controller\%PROCESS_NAME%"
if not defined APP_PATH if exist "%ProgramFiles(x86)%\UF Bay Controller\%PROCESS_NAME%" set "APP_PATH=%ProgramFiles(x86)%\UF Bay Controller\%PROCESS_NAME%"
if not defined APP_PATH (
    for /d %%U in ("%SystemDrive%\Users\*") do (
        if not defined APP_PATH if exist "%%~fU\AppData\Local\Programs\UF Bay Controller\%PROCESS_NAME%" set "APP_PATH=%%~fU\AppData\Local\Programs\UF Bay Controller\%PROCESS_NAME%"
    )
)

tasklist /FI "IMAGENAME eq %PROCESS_NAME%" 2>NUL | find /I "%PROCESS_NAME%" >NUL
if %ERRORLEVEL% EQU 0 goto :eof          :: already running — do nothing

if defined APP_PATH start "" "%APP_PATH%"  :: dead — relaunch
```

Key lessons baked in:
- **Single check per run, no loop.** The scheduled task re-fires every minute. A looping
  script would fight Task Scheduler and can stack.
- **Runtime path resolution.** Bay PCs have different Windows account names and install
  scopes (per-user vs all-users). Hardcoding `C:\Users\golf\...` breaks silently.
- `tasklist | find` is the liveness test — cheap and reliable. The single-instance lock
  (piece 1) makes the "already running → exit" case free.

### 3. Silent scheduled task registration — `electron/installer.nsh` + self-heal in `main.js`

The NSIS installer creates the task pointing at the **VBS, never the BAT**:

```nsis
; Remove any legacy visible-console task from older versions.
nsExec::ExecToLog 'schtasks /Delete /F /TN "<Venue> Bay Controller Watchdog"'

; NOTE: NSIS escapes quotes with $\" — a plain \" silently breaks /TR and the
; task is never created. This was a real bug; do not "fix" the escaping.
ReadEnvStr $0 USERNAME
nsExec::ExecToLog 'schtasks /Create /F /SC MINUTE /MO 1 /TN "<Venue> Bay Controller Watchdog Silent" /TR "wscript.exe //B //Nologo $\"$INSTDIR\resources\watchdog.vbs$\"" /RU "$0" /IT'
${If} task creation failed
  ; Fallback without /RU (defaults to installing user, no interactive flag)
${EndIf}
```

And because installer task registration can silently fail (bad quoting, blocked
elevation, a tech deleting the task), the app **self-heals on every launch**
(`ensureWatchdogTask()` in `electron/main.js`):

```js
async function ensureWatchdogTask() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const OLD_TASK = '<Venue> Bay Controller Watchdog';        // legacy visible task
  const TASK = '<Venue> Bay Controller Watchdog Silent';
  const vbsPath = path.join(process.resourcesPath, 'watchdog.vbs');
  if (!fs.existsSync(vbsPath)) return;
  try { await execAsync(`schtasks /Delete /F /TN "${OLD_TASK}"`); } catch {}
  try {
    const { stdout } = await execAsync(`schtasks /Query /TN "${TASK}"`);
    if (stdout?.includes(TASK)) return;                       // already present
  } catch { /* missing — create below */ }
  const user = process.env.USERNAME || '';
  const base = `schtasks /Create /F /SC MINUTE /MO 1 /TN "${TASK}" /TR "wscript.exe //B //Nologo \\"${vbsPath}\\""`;
  try { await execAsync(user ? `${base} /RU "${user}" /IT` : base); }
  catch { await execAsync(base); }
}
```

This means: even if the installer got it wrong, the next auto-update (or any manual
launch) repairs crash recovery. Uninstall must delete both task names
(see `customUnInstall` in `installer.nsh`).

### 4. Silent tray boot — `electron/main.js`

The relaunch must be invisible: no login splash, no window over the simulator.

- On `ready`, the window is created **hidden**; only the tray icon appears. The window
  shows only when staff open it from the tray.
- The `close` event is always intercepted → minimize to tray instead (so clicking X can
  never actually kill the app; the watchdog is the safety net for real crashes).
- The Startup-folder shortcut (`CreateShortCut "$SMSTARTUP\..."` in `installer.nsh`)
  plus the watchdog gives two independent launch paths — both gated by the
  single-instance lock.

Both files ship via `extraResources` in `electron/package.json` so they land in
`resources\` next to the installed exe:

```jsonc
"extraResources": [
  { "from": "watchdog.bat", "to": "watchdog.bat" },
  { "from": "watchdog.vbs", "to": "watchdog.vbs" }
]
```

## How the pieces interact

```text
Windows login
 ├─ Startup shortcut ──► app launches hidden to tray
 │                        (single-instance lock: quit if already running)
 └─ every 1 min: Task Scheduler → wscript.exe (no window) → watchdog.vbs → watchdog.bat
                  └─ tasklist check: running? exit silently
                                     dead?    relaunch → app boots hidden to tray

Crash / kill ──► next watchdog tick (≤60s) relaunches ──► ensureWatchdogTask()
                 re-verifies the task itself ──► recovery is self-repairing
```

## Checklist for a new venue

1. Copy `watchdog.bat`, `watchdog.vbs`, the NSIS hooks, and the `main.js` blocks
   (single-instance lock, `ensureWatchdogTask()`, hidden-boot, close-to-tray).
2. Rename, in **all** places consistently: the process name (`<Venue> Bay Controller.exe`
   — this is electron-builder's `productName` + `.exe`), the install folder name, and
   both scheduled-task names.
3. Add both watchdog files to `extraResources`.
4. Keep the NSIS `$\"` escaping exactly as-is.
5. Never add window-focus code to the `second-instance` handler.
6. Verify on a bay PC: kill the process in Task Manager → it reappears (tray only)
   within 60s; launch it twice manually → only one instance; watch for any console
   flash on the minute boundary → there must be none.
