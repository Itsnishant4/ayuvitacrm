!macro customInit
  ; Preemptive kill - runs early in .onInit (may run before UAC elevation)
  ExecWait 'taskkill /f /im "${APP_EXECUTABLE_FILENAME}"'
  Sleep 1000
!macroend

!macro customCheckAppRunning
  ; REPLACES the default CHECK_APP_RUNNING macro entirely
  ; Instead of showing "app is running" errors, we auto-kill silently
  DetailPrint "Closing ${APP_EXECUTABLE_FILENAME} if running..."
  ExecWait 'taskkill /f /im "${APP_EXECUTABLE_FILENAME}"'
  Sleep 2000
  ExecWait 'taskkill /f /fi "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}"'
  Sleep 2000
!macroend
