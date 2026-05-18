@echo off
rem Thin wrapper that invokes install.ps1 via PowerShell. Passes all arguments through.
rem Examples:
rem   install.bat              -> project-local install (.\.claude\)
rem   install.bat -User        -> user-global install (%USERPROFILE%\.claude\)
rem   install.bat -Help        -> show install.ps1 help
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
exit /b %ERRORLEVEL%
