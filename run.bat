@echo off
REM ---------------------------------------------------------------------------
REM Double-clickable launcher for the SAP Monitoring System.
REM
REM All this does is hand off to run.ps1, which holds the actual logic. Every
REM switch is passed straight through, so these are equivalent:
REM
REM     run.bat            .\run.ps1
REM     run.bat -Fresh     .\run.ps1 -Fresh
REM     run.bat -Stop      .\run.ps1 -Stop
REM     run.bat -Status    .\run.ps1 -Status
REM
REM -ExecutionPolicy Bypass is what makes this work on a machine where the
REM default policy would refuse to run an unsigned .ps1.
REM
REM Kept ASCII-only with CRLF endings on purpose: cmd.exe is unreliable with
REM LF-only batch files, and PowerShell 5.1 mis-decodes non-ASCII in a script
REM saved without a BOM.
REM ---------------------------------------------------------------------------

setlocal
pushd "%~dp0"

if not exist "%~dp0run.ps1" (
    echo FAILED: run.ps1 was not found next to this file.
    echo         Keep run.bat and run.ps1 together in the project root.
    echo.
    pause
    exit /b 1
)

REM Explorer starts a double-click as: cmd /c ""...\run.bat" "
REM When the command line names this file, the console window belongs to us and
REM has to be held open, or any error would flash past and vanish.
set "HOLD_WINDOW="
echo %cmdcmdline% | find /i "%~nx0" >nul 2>&1 && set "HOLD_WINDOW=1"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

popd

if defined HOLD_WINDOW (
    echo.
    pause
)

exit /b %EXITCODE%
