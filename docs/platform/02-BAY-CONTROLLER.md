# 02 — Bay Controller (Windows Electron app)

A dedicated Windows application, one per bay PC, that automates everything physical:
power, launching the simulator, applying the customer's settings, warnings, shutdown, and
league video recording.

## Architecture

- `electron/main.js` — main process: scheduling, plug control, process management, file
  watching, OBS control, uploads, auto-update.
- `electron/preload.js` — IPC bridge.
- `electron/tapo_control.py` → compiled to `tapo_control.exe` — TP-Link Tapo P110 smart
  plug control (login, on, off, status).
- `electron/obs-controller.js` — OBS WebSocket control for league recordings.
- `electron/hole-splitter.js` — splits a round recording into per-hole clips.
- `src/pages/BayController.tsx` + `src/bay-controller-main.tsx` + `bay-controller.html` —
  the renderer UI, built by `vite.config.electron.ts`.
- Backend: `bay-controller-api` edge function, plus tables `bays`, `bay_devices`,
  `bay_commands`, `bay_controller_logs`, `bay_orders`.

**It must run as a single instance.** Two instances cause conflicting precision-scheduler
actions. `watchdog.bat` (Windows Task Scheduler, every 30s) restarts it if it is closed.

WebViews load the **Hub domain**, not a bundled copy of the app. The only hardcoded HTML
is the Welcome Window.

## Automation timeline (relative to booking start / end)

| Time | Action |
| --- | --- |
| T-3m (hardware) | Smart plug on — PC and hardware boot |
| T-3m (pre-launch) | Restore settings: shared baseline, then the customer's own snapshot |
| T-1m (app) | Launch GSPro / simulator software |
| In-session | 5-minute and 1-minute warnings shown to the customer |
| End-3m | Capture the customer's current settings files and upload to their account |
| End-20s | Close simulator apps |
| End+0 | Smart plug off |

Back-to-back bookings **bypass** the T-20s close and T+0 power-off; a 5-second intentional
cooldown separates state transitions.

## State machine

Automation is an explicit state machine (`IDLE`, `PRE_START`, `RUNNING`, `CLOSING`, …),
not a set of ad-hoc timers. Key reliability behaviours learned the hard way:

- **Just-in-time validation**: timed callbacks re-read the live bookings ref before acting,
  so a cancelled or rescheduled booking cannot trigger a phantom launch.
- **B2B launch guard**: `isAfter(now, appLaunchTime)` prevents phantom launches in the gap
  between consecutive bookings.
- **Reschedule plug-off safety net**: a polling effect turns plugs off whenever
  `shouldBeOn` is false; the scheduler clears its Map on cleanup.
- **Launch loop protection**: 3 failed display-detection retries triggers a 60-second
  lockout.
- **Crash recovery**: 1.5s reload cooldown on `render-process-gone`, logged to
  `controller-crash.log`.
- **Mode sync**: Auto/Manual mode toggles are delivered by INSERT into `bay_commands` with
  Realtime plus a polling fallback (Realtime alone was unreliable).

## Customer settings (two-layer restore)

1. **Shared baseline** — the venue's known-good simulator settings files.
2. **Customer snapshot** — the files captured at the end of that customer's last session,
   stored against their account (`bay-user-settings` edge function).

The restore runs **before every launch**, whether the launch was automated or triggered by
staff closing/reopening apps. Baseline files are *not* restored when GSPro closes — that
behaviour caused customers to lose their settings.

`closeApps()` kills any process with a visible window from a whitelist, so a renamed
simulator binary cannot survive shutdown. On close/F10 the GSPro config files are reset to
fix a single-monitor window-position bug.

## Display handling

90-second warm-up delays, 3 positioning retries, `Win+Shift+Arrow` fallback, and no active
repositioning afterwards (it fought the user). F7/F9 toggle overlays; F10 does a manual
reposition and state restore.

## Smart plugs (Tapo) — MAC binding

Plugs are identified by **MAC address**, never by IP. IP is a disposable cache.

- **Search** in the plug section runs `tapo_control.exe --discover`: a UDP broadcast probe
  (ports 20002/9999) plus a concurrent port-80 sweep of the local /24, then authenticates
  each hit to read nickname, model, MAC and firmware. Seconds, not minutes.
- Assignments store `{mac, nickname, ip}`. Every control call passes the MAC; if the cached
  IP fails, the script re-discovers the plug by MAC, updates the cache and retries. DHCP
  reshuffles are invisible.
- **Firmware 1.4.x is unsupported** (TP-Link's TPAP encryption blocks all local control).
  Discovery flags those units in red — never install one in a bay. Keep auto-update OFF in
  the Tapo app and keep Third-Party Compatibility ON.
- Belt and braces: still add DHCP reservations for the plug MACs, and confirm plugs and bay
  PCs share a subnet with AP client isolation disabled.

## Kiosk Mode (Beta)


Locks the PC to the simulator experience during a session; staff unlock with a code.

## Notifications and popups

Warnings render as frameless always-on-top `BrowserWindow`s, not main-window
notifications (which spammed). The 1-minute warning is suppressed if the next booking
starts within 120 seconds.

## League recording

- OBS is started/stopped by `obs-controller.js` for league (SGT) rounds only.
- A global hotkey `Ctrl+Shift+F12`, mapped to the physical green button in the bay, flags a
  highlight marker in OBS.
- Recordings upload to Cloudflare Stream using **tus** resumable uploads (plain uploads hit
  a 2GB limit). `waitForStableSize()` waits for the file to stop growing before upload,
  which fixed Cloudflare error 10031 (size mismatch).
- **Hard stop 2 minutes before session end** — this is the guaranteed termination point.
  Do not rely on power-cut or display-off events: Chromium background throttling freezes
  Electron timers when the display sleeps, which once produced a 4-hour recording.
- Range/launch-monitor CSVs are exported on simulator close and posted to
  `bay-controller-api`; `fs.watch` attributes them to the booking that just ended.

## Logging

Every scheduled action writes a high-precision `local_timestamp` entry to
`bay_controller_logs`, viewable in Admin → Bay Controller Logs. Use these logs first when
diagnosing any automation complaint.

## Versioning

The renderer fetches the exact binary version over IPC (`get-app-version`). GitHub push
titles for controller changes use the convention `{version} - {description}`, e.g.
`1.0.70 - Fixed plug-off race`. See `09-BAY-CONTROLLER-BUILD.md`.
