@echo off
rem Thin wrapper that invokes rust-cc-install.ps1 via PowerShell. Passes all arguments through.
rem Examples:
rem   rust-cc-install.bat              -> project-local install (.\.claude\)
rem   rust-cc-install.bat -User        -> user-global install (%USERPROFILE%\.claude\)
rem   rust-cc-install.bat -Help        -> show rust-cc-install.ps1 help
rem Clear an inherited PSModulePath (e.g. from PowerShell 7) that shadows the Windows PowerShell
rem module directories; powershell.exe rebuilds its defaults when the variable is unset.
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rust-cc-install.ps1" %*
exit /b %ERRORLEVEL%
