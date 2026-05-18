@echo off
rem Thin wrapper that invokes uninstall.ps1 via PowerShell. Passes all arguments through.
rem Examples:
rem   uninstall.bat            -> project-local uninstall (.\.claude\)
rem   uninstall.bat -User      -> user-global uninstall (%USERPROFILE%\.claude\)
rem   uninstall.bat -Help      -> show uninstall.ps1 help
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
exit /b %ERRORLEVEL%
