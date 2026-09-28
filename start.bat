@echo off
REM ---------------------------------------------------------------------------
REM Double-clickable launcher for the SAP Monitoring System.
REM Hand off to start.ps1 which manages database, Node, and Python environments.
REM
REM   start.bat                 Full stack (Next.js + worker + batch backend)
REM   start.bat -BatchOnly      Batch monitor backend only  (port 8000)
REM ---------------------------------------------------------------------------

setlocal
pushd "%~dp0"

if not exist "%~dp0start.ps1" (
    echo FAILED: start.ps1 was not found next to this file.
    echo         Keep start.bat and start.ps1 together in the project root.
    echo.
    pause
    exit /b 1
)

set "HOLD_WINDOW="
echo %cmdcmdline% | find /i "%~nx0" >nul 2>&1 && set "HOLD_WINDOW=1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

popd

if defined HOLD_WINDOW (
    echo.
    pause
)

exit /b %EXITCODE%
