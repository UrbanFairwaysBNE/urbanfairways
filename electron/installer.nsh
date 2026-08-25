; Custom NSIS hooks for UF Bay Controller
; Adds a shortcut to the Windows Startup folder so the controller always
; launches at login, independent of the app's own registry Run entry.

!macro customInstall
  ; $SMSTARTUP resolves to the per-user (or all-users, for machine installs) Startup folder
  CreateShortCut "$SMSTARTUP\UF Bay Controller.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  ; Register the watchdog as a scheduled task (runs every minute, relaunches if closed).
  ; Runs as the logged-in bay user (never a hardcoded account name) so it can show a window.
  nsExec::ExecToLog 'schtasks /Create /F /SC MINUTE /MO 1 /TN "UF Bay Controller Watchdog" /TR "\"$INSTDIR\resources\watchdog.bat\"" /RU "%USERNAME%" /IT'

!macroend

!macro customUnInstall
  Delete "$SMSTARTUP\UF Bay Controller.lnk"
  nsExec::ExecToLog 'schtasks /Delete /F /TN "UF Bay Controller Watchdog"'
!macroend
