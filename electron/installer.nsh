; Custom NSIS hooks for UF Bay Controller
!include "LogicLib.nsh"

; Adds a shortcut to the Windows Startup folder so the controller always
; launches at login, independent of the app's own registry Run entry.

!macro customInstall
  ; $SMSTARTUP resolves to the per-user (or all-users, for machine installs) Startup folder
  CreateShortCut "$SMSTARTUP\UF Bay Controller.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  ; Register the watchdog as a scheduled task (runs every minute, relaunches if closed).
  ; It must be TOTALLY SILENT: running watchdog.bat directly makes Task Scheduler
  ; flash a console window every minute, which steals focus from the golf apps.
  ; So the task runs wscript.exe (no window) against watchdog.vbs, which launches
  ; the .bat hidden.
  ; NOTE: NSIS escapes quotes with $\" - a backslash-quote is passed through literally
  ; and breaks the /TR path, which silently leaves the task uncreated.
  ; Runs as the logged-in bay user (never a hardcoded account name).

  ; Remove the old visible-console task from previous versions.
  nsExec::ExecToLog 'schtasks /Delete /F /TN "UF Bay Controller Watchdog"'
  Pop $2

  ReadEnvStr $0 USERNAME
  nsExec::ExecToLog 'schtasks /Create /F /SC MINUTE /MO 1 /TN "UF Bay Controller Watchdog Silent" /TR "wscript.exe //B //Nologo $\"$INSTDIR\resources\watchdog.vbs$\"" /RU "$0" /IT'
  Pop $1
  ${If} $1 != 0
    ; Fallback: no /RU (defaults to the installing user, no interactive flag)
    nsExec::ExecToLog 'schtasks /Create /F /SC MINUTE /MO 1 /TN "UF Bay Controller Watchdog Silent" /TR "wscript.exe //B //Nologo $\"$INSTDIR\resources\watchdog.vbs$\""'
    Pop $1
  ${EndIf}


!macroend

!macro customUnInstall
  Delete "$SMSTARTUP\UF Bay Controller.lnk"
  nsExec::ExecToLog 'schtasks /Delete /F /TN "UF Bay Controller Watchdog"'
  nsExec::ExecToLog 'schtasks /Delete /F /TN "UF Bay Controller Watchdog Silent"'
!macroend
