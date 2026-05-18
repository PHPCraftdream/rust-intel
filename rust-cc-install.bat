@echo off
rem Thin wrapper that invokes rust-cc-install.ps1 via PowerShell. Passes all arguments through.
rem Examples:
rem   rust-cc-install.bat              -> project-local install (.\.claude\)
rem   rust-cc-install.bat -User        -> user-global install (%USERPROFILE%\.claude\)
rem   rust-cc-install.bat -Help        -> show rust-cc-install.ps1 help
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rust-cc-install.ps1" %*
exit /b %ERRORLEVEL%
