!include "LogicLib.nsh"

!macro customInstall
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO" "DisplayVersion"
  ${If} $0 == ""
    DetailPrint "Installing PawnIO (required for real hardware sensors and fan control)..."
    ExecWait '"$INSTDIR\resources\pawnio\PawnIO_setup.exe" -install -silent' $1
    DetailPrint "PawnIO installer exit code: $1"
  ${Else}
    DetailPrint "PawnIO $0 already installed, skipping."
  ${EndIf}
!macroend

; "Iniciar con Windows" registers a logon scheduled task (see electron/startup.cjs);
; remove it so an uninstalled FanFlow doesn't leave a dangling startup entry.
!macro customUnInstall
  ExecWait 'schtasks.exe /Delete /TN "FanFlow" /F'
!macroend
