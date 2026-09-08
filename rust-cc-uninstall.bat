@echo off
rem Thin wrapper that invokes rust-cc-uninstall.ps1 via PowerShell. Passes all arguments through.
rem Examples:
rem   rust-cc-uninstall.bat            -> project-local uninstall (.\.claude\)
rem   rust-cc-uninstall.bat -User      -> user-global uninstall (%USERPROFILE%\.claude\)
rem   rust-cc-uninstall.bat -Help      -> show rust-cc-uninstall.ps1 help
rem Clear an inherited PSModulePath (e.g. from PowerShell 7) that shadows the Windows PowerShell
rem module directories; powershell.exe rebuilds its defaults when the variable is unset.
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rust-cc-uninstall.ps1" %*
exit /b %ERRORLEVEL%
