<#
.SYNOPSIS
    One-command launcher for the SAP Monitoring System.

.DESCRIPTION
    Brings the whole stack up in the right order and leaves it running in the
    foreground: physical Postgres check -> schema -> Excel import -> Next.js +
    collector worker + batch backend. Everything it does is idempotent, so
    re-running it is always safe.

    Steps, in order:
      1. Check node / npm are present
      2. Verify the physical Postgres instance is reachable (TCP + login)
      3. npm install          (only when node_modules is missing)
      4. .env                 (copied from .env.example when missing)
      5. npm run migrate      (schema.sql + seed.sql, both idempotent)
      6. npm run import       (only when the observations table is empty)
      7. npm run dev          (Next.js :3000, collector worker, batch backend :8000)

    NOTE: this file is deliberately ASCII-only. Windows PowerShell 5.1 reads a
    BOM-less .ps1 as ANSI, and a stray em-dash decodes into bytes that include a
    double quote, which breaks parsing in ways that are painful to diagnose.

.PARAMETER Prod
    Serve the production build instead of the dev servers.

.PARAMETER SetupOnly
    Do everything except start the servers - the equivalent of `npm run setup`.

.PARAMETER Import
    Force the Excel import even when the database already holds observations.

.PARAMETER SkipImport
    Never run the Excel import, even on an empty database.

.PARAMETER Stop
    Shut down the application processes (does not touch the database).

.PARAMETER Status
    Report what is currently running, then exit.

.PARAMETER NoBrowser
    Do not open the dashboard in the default browser once it is listening.

.PARAMETER BatchOnly
    Start only the batch monitor backend (port 8000).

.EXAMPLE
    .\start.ps1
    Cold start or warm restart - the normal way to run the program.

.EXAMPLE
    .\start.ps1 -Stop
    Stop the application servers.

.NOTES
    If PowerShell refuses to run the file, launch it as:
        powershell -ExecutionPolicy Bypass -File .\start.ps1
#>
[CmdletBinding()]
param(
    [switch]$Prod,
    [switch]$SetupOnly,
    [switch]$Import,
    [switch]$SkipImport,
    [switch]$Stop,
    [switch]$Status,
    [switch]$NoBrowser,
    [switch]$BatchOnly
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$ApiPort  = 3000
$PrevPort = 3000
$Workbook = 'ERP Monitoring Log.xlsx'

# --- Output helpers ----------------------------------------------------------
function Write-Step { param([string]$Text) Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Text) Write-Host "    $Text" -ForegroundColor Green }
function Write-Info { param([string]$Text) Write-Host "    $Text" -ForegroundColor DarkGray }
function Write-Note { param([string]$Text) Write-Host "    $Text" -ForegroundColor Yellow }

function Stop-WithError {
    param([string]$Text, [string]$Hint)
    Write-Host ''
    Write-Host "FAILED: $Text" -ForegroundColor Red
    if ($Hint) { Write-Host "        $Hint" -ForegroundColor Yellow }
    Write-Host ''
    exit 1
}

function Invoke-Npm {
    param([string[]]$Arguments, [string]$What)
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "$What failed (npm exited $LASTEXITCODE)." 'Scroll up for the underlying error.'
    }
}

# --- Database config (reads .env if present, falls back to defaults) ----------
function Get-DbConfig {
    $cfg = @{ Host = 'localhost'; Port = 5432; User = 'sapmon'; Password = 'sapmon123'; Database = 'sap_monitoring' }

    $envFile = Join-Path $PSScriptRoot '.env'
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in (Get-Content $envFile)) {
            if ($line -match '^\s*DATABASE_URL\s*=\s*postgresql://([^:]+):([^@]+)@([^:/]+):?(\d*)/(\S+)') {
                $cfg.User     = $Matches[1]
                $cfg.Password = $Matches[2]
                $cfg.Host     = $Matches[3]
                if ($Matches[4]) { $cfg.Port = [int]$Matches[4] }
                $cfg.Database = $Matches[5] -replace '[?#].*', ''
            }
            elseif ($line -match '^\s*DB_HOST\s*=\s*(.+)$')     { $cfg.Host     = $Matches[1].Trim() }
            elseif ($line -match '^\s*DB_PORT\s*=\s*(\d+)')      { $cfg.Port     = [int]$Matches[1] }
            elseif ($line -match '^\s*DB_USER\s*=\s*(.+)$')      { $cfg.User     = $Matches[1].Trim() }
            elseif ($line -match '^\s*DB_PASSWORD\s*=\s*(.+)$')  { $cfg.Password = $Matches[1].Trim() }
            elseif ($line -match '^\s*DB_NAME\s*=\s*(.+)$')      { $cfg.Database = $Matches[1].Trim() }
        }
    }
    return $cfg
}

# --- Physical Postgres helpers -----------------------------------------------

# Quick TCP reachability check - does not need psql on PATH.
function Test-PostgresTcp {
    param([string]$Host, [int]$Port)
    try {
        $tcp = [System.Net.Sockets.TcpClient]::new()
        $ar  = $tcp.BeginConnect($Host, $Port, $null, $null)
        $ok  = $ar.AsyncWaitHandle.WaitOne(3000)
        $tcp.Close()
        return $ok
    }
    catch { return $false }
}

# Full login check via psql (optional - only runs when psql is on PATH).
function Test-PostgresLogin {
    param([hashtable]$Cfg)
    if (-not (Get-Command 'psql' -ErrorAction SilentlyContinue)) { return $null }
    $env:PGPASSWORD = $Cfg.Password
    $out = & psql -h $Cfg.Host -p $Cfg.Port -U $Cfg.User -d $Cfg.Database -tAc 'SELECT 1' 2>$null
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    return ($LASTEXITCODE -eq 0 -and ($out -match '1'))
}

function Wait-ForPostgres {
    param([hashtable]$Cfg, [int]$TimeoutSeconds = 30)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PostgresTcp -Host $Cfg.Host -Port $Cfg.Port) { return $true }
        Start-Sleep -Milliseconds 1000
    }
    return $false
}

function Get-ObservationCount {
    param([hashtable]$Cfg)
    if (-not (Get-Command 'psql' -ErrorAction SilentlyContinue)) { return -1 }
    $env:PGPASSWORD = $Cfg.Password
    $out = & psql -h $Cfg.Host -p $Cfg.Port -U $Cfg.User -d $Cfg.Database -tAc 'SELECT count(*) FROM observations' 2>$null
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) { return -1 }
    $text = ($out | Select-Object -First 1)
    $parsed = 0
    if ([int]::TryParse($text.Trim(), [ref]$parsed)) { return $parsed }
    return -1
}

# --- Process / port helpers --------------------------------------------------
function Get-PortOwner {
    param([int]$Port)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $conn) { return $null }
    return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

function Get-ProjectNodeProcess {
    $root = $PSScriptRoot.ToLower()
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($root) }
}

function Invoke-TaskKill {
    param([int]$ProcessId)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try { & taskkill /PID $ProcessId /T /F 2>$null | Out-Null } catch { }
    $ErrorActionPreference = $previous
    return ($LASTEXITCODE -eq 0)
}

function Stop-AppProcess {
    $killed = 0
    foreach ($proc in Get-ProjectNodeProcess) {
        if (Invoke-TaskKill -ProcessId $proc.ProcessId) { $killed++ }
    }
    Start-Sleep -Milliseconds 400
    foreach ($port in @($ApiPort, $PrevPort)) {
        $owner = Get-PortOwner -Port $port
        if ($owner -and $owner.ProcessName -eq 'node') {
            if (Invoke-TaskKill -ProcessId $owner.Id) { $killed++ }
        }
    }
    return $killed
}

# --- -Status -----------------------------------------------------------------
if ($Status) {
    $cfg = Get-DbConfig
    Write-Host ''
    Write-Step 'SAP Monitoring System - status'

    if (Test-PostgresTcp -Host $cfg.Host -Port $cfg.Port) {
        $loginOk = Test-PostgresLogin -Cfg $cfg
        if ($loginOk -eq $true)  { Write-Ok  "database   $($cfg.Host):$($cfg.Port)/$($cfg.Database) - reachable, login OK" }
        elseif ($loginOk -eq $false) { Write-Note "database   $($cfg.Host):$($cfg.Port) - TCP OK but login failed (check credentials)" }
        else { Write-Ok "database   $($cfg.Host):$($cfg.Port) - TCP reachable (psql not on PATH, skipping login check)" }
    }
    else {
        Write-Note "database   $($cfg.Host):$($cfg.Port) - not reachable (is PostgreSQL running?)"
    }

    foreach ($pair in @(@{ Name = 'dashboard '; Port = $ApiPort })) {
        $owner = Get-PortOwner -Port $pair.Port
        if ($owner) { Write-Ok "$($pair.Name) :$($pair.Port) - $($owner.ProcessName) (PID $($owner.Id))" }
        else { Write-Info "$($pair.Name) :$($pair.Port) - not listening" }
    }

    $nodes = @(Get-ProjectNodeProcess)
    Write-Info "node       $($nodes.Count) project process(es) running"
    Write-Host ''
    exit 0
}

# --- -Stop -------------------------------------------------------------------
if ($Stop) {
    Write-Host ''
    Write-Step 'Stopping the SAP Monitoring System'
    $killed = Stop-AppProcess
    Write-Ok "stopped $killed application process tree(s)"
    Write-Host ''
    Write-Host 'Application stopped. PostgreSQL keeps running - stop it from its service manager.' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# --- -BatchOnly --------------------------------------------------------------
if ($BatchOnly) {
    Write-Host ''
    Write-Step 'Starting batch monitor backend only (port 8000)'
    Write-Host '    Press Ctrl+C to stop.' -ForegroundColor Yellow
    Write-Host ''
    & npm run dev:batch-backend
    exit $LASTEXITCODE
}

# --- Preflight ---------------------------------------------------------------
Write-Host ''
Write-Host '  SAP Monitoring System' -ForegroundColor White
Write-Host '  ---------------------' -ForegroundColor DarkGray
Write-Host ''

Write-Step 'Checking prerequisites'

foreach ($tool in @(
    @{ Cmd = 'node'; Hint = 'Install Node.js 20 or newer from https://nodejs.org' },
    @{ Cmd = 'npm';  Hint = 'npm ships with Node.js - reinstall Node.js' }
)) {
    if (-not (Get-Command $tool.Cmd -ErrorAction SilentlyContinue)) {
        Stop-WithError "'$($tool.Cmd)' was not found on PATH." $tool.Hint
    }
}

Write-Ok "node $(& node --version)"

# --- .env --------------------------------------------------------------------
if (-not (Test-Path -LiteralPath '.env')) {
    if (Test-Path -LiteralPath '.env.example') {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
        Write-Step 'Created .env from .env.example'
        Write-Info 'every key has a working default - edit it to point at your PostgreSQL instance'
    }
}

$dbCfg = Get-DbConfig

# --- Database check ----------------------------------------------------------
Write-Step "Checking PostgreSQL at $($dbCfg.Host):$($dbCfg.Port)"

if (-not (Wait-ForPostgres -Cfg $dbCfg -TimeoutSeconds 10)) {
    Stop-WithError "Cannot reach PostgreSQL at $($dbCfg.Host):$($dbCfg.Port)." `
        "Make sure PostgreSQL is running and the host/port in .env match your installation."
}

$loginOk = Test-PostgresLogin -Cfg $dbCfg
if ($loginOk -eq $false) {
    Stop-WithError "PostgreSQL is reachable but login failed (user=$($dbCfg.User), db=$($dbCfg.Database))." `
        "Check DB_USER, DB_PASSWORD, and DB_NAME in your .env file."
}

if ($loginOk -eq $true) {
    Write-Ok "connected as $($dbCfg.User) to $($dbCfg.Database)"
}
else {
    Write-Ok "TCP reachable at $($dbCfg.Host):$($dbCfg.Port) (psql not on PATH - skipping login check)"
}

# --- Dependencies ------------------------------------------------------------
if (-not (Test-Path -LiteralPath 'node_modules')) {
    Write-Step 'Installing dependencies (first run - this takes a minute)'
    Invoke-Npm -Arguments @('install') -What 'npm install'
    Write-Ok 'dependencies installed'
}

# --- Schema ------------------------------------------------------------------
Write-Step 'Applying schema and seed data'
Invoke-Npm -Arguments @('run', 'migrate') -What 'npm run migrate'

# --- Import ------------------------------------------------------------------
$rowCount = Get-ObservationCount -Cfg $dbCfg

if ($SkipImport) {
    Write-Info 'skipping the Excel import (-SkipImport)'
}
elseif ($Import -or $rowCount -le 0) {
    if (-not (Test-Path -LiteralPath $Workbook)) {
        Write-Note "'$Workbook' is missing - skipping the import, so the dashboard will have no data"
    }
    else {
        Write-Step 'Importing the monitoring workbook'
        Invoke-Npm -Arguments @('run', 'import') -What 'npm run import'
    }
}
else {
    Write-Step 'Database already populated'
    Write-Info "$rowCount observations on file - skipping the import (force it with -Import)"
}

if ($SetupOnly) {
    Write-Host ''
    Write-Host 'Setup complete. Start the servers with: .\start.ps1' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# --- Port cleanup ------------------------------------------------------------
$busy = @()
foreach ($port in @($ApiPort)) {
    if (Get-PortOwner -Port $port) { $busy += $port }
}
if ($busy.Count -gt 0) {
    Write-Note "ports $($busy -join ', ') are already in use - stopping the previous run"
    $killed = Stop-AppProcess
    Start-Sleep -Milliseconds 700
    Write-Ok "stopped $killed process(es)"

    $stillBusy = @()
    foreach ($port in @($ApiPort)) {
        if (Get-PortOwner -Port $port) { $stillBusy += $port }
    }
    if ($stillBusy.Count -gt 0) {
        Stop-WithError "port(s) $($stillBusy -join ', ') are held by something that is not this project." `
            'Close whatever owns them, then re-run.'
    }
}

# --- Servers -----------------------------------------------------------------
$uiPort = $ApiPort

if (-not $NoBrowser) {
    $waiter = 'for ($i = 0; $i -lt 120; $i++) { if (Get-NetTCPConnection -State Listen -LocalPort ' +
              $uiPort + ' -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 800; Start-Process ' +
              "'http://localhost:$uiPort'" + '; break }; Start-Sleep -Milliseconds 500 }'
    Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $waiter -WindowStyle Hidden | Out-Null
}

Write-Host ''
Write-Step 'Starting the application'
Write-Info "dashboard   http://localhost:$uiPort"
Write-Info "batch API   http://localhost:8000"
Write-Info "database    $($dbCfg.Host):$($dbCfg.Port)/$($dbCfg.Database)"
Write-Host ''
Write-Host '    Press Ctrl+C to stop the servers.' -ForegroundColor Yellow
Write-Host ''

if ($Prod) {
    Write-Step 'Building the production bundle'
    Invoke-Npm -Arguments @('run', 'build') -What 'npm run build'
    & npm run start
}
else {
    & npm run dev
}

Write-Host ''
Write-Host 'Servers stopped.' -ForegroundColor Cyan
Write-Host ''
