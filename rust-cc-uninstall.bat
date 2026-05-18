@echo off
rem Thin wrapper that invokes rust-cc-uninstall.ps1 via PowerShell. Passes all arguments through.
rem Examples:
rem   rust-cc-uninstall.bat            -> project-local uninstall (.\.claude\)
rem   rust-cc-uninstall.bat -User      -> user-global uninstall (%USERPROFILE%\.claude\)
rem   rust-cc-uninstall.bat -Help      -> show rust-cc-uninstall.ps1 help
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rust-cc-uninstall.ps1" %*
exit /b %ERRORLEVEL%
