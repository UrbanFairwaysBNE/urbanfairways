' ============================================================
' UF Bay Controller Watchdog - silent launcher
' ============================================================
' Task Scheduler runs a .bat in a visible console window, which
' flashes on screen every minute and steals focus from the golf
' apps. wscript.exe has no window at all, so the scheduled task
' points here and this script runs watchdog.bat fully hidden
' (window style 0) without waiting for it.
' ============================================================

Dim sh, fso, here
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & here & "\watchdog.bat""", 0, False
