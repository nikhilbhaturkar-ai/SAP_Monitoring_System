<#
.SYNOPSIS
    One-command launcher for the SAP Monitoring System.

.DESCRIPTION
    Brings the whole stack up in the right order and leaves it running in the
    foreground: Docker Postgres -> schema -> Excel import -> API + Vite + collector
    worker. Everything it does is idempotent, so re-running it is always safe.

    Steps, in order:
      1. Check node / npm / docker are present and the Docker daemon is up
      2. npm install          (only when node_modules is missing)
      3. .env                 (copied from .env.example when missing)
      4. docker compose up -d and wait for the health check to pass
      5. npm run migrate      (schema.sql + seed.sql, both idempotent)
      6. npm run import       (only when the observations table is empty)
      7. npm run dev          (API :4000, Vite :5173, collector worker)

    NOTE: this file is deliberately ASCII-only. Windows PowerShell 5.1 reads a
    BOM-less .ps1 as ANSI, and a stray em-dash decodes into bytes that include a
    double quote, which breaks parsing in ways that are painful to diagnose.

.PARAMETER Fresh
    Drop the database volume and rebuild from scratch (docker compose down -v),
    then re-run the schema and the Excel import. Destroys collected history.

.PARAMETER Prod
    Serve the production build instead of the dev servers: vite build, then the
    API plus `vite preview` on :4173 (which proxies /api the same way dev does).

.PARAMETER SetupOnly
    Do everything except start the servers - the equivalent of `npm run setup`.

.PARAMETER Import
    Force the Excel import even when the database already holds observations.

.PARAMETER SkipImport
    Never run the Excel import, even on an empty database.

.PARAMETER Stop
    Shut everything down: the dev/prod processes and the Postgres container.
    The database volume is kept - use -Fresh to discard it.

.PARAMETER Status
    Report what is currently running, then exit.

.PARAMETER NoBrowser
    Do not open the dashboard in the default browser once it is listening.

.EXAMPLE
    .\run.ps1
    Cold start or warm restart - the normal way to run the program.

.EXAMPLE
    .\run.ps1 -Fresh
    Wipe the database and rebuild it from the workbook.

.EXAMPLE
    .\run.ps1 -Stop
    Stop the servers and the database container.

.NOTES
    If PowerShell refuses to run the file, launch it as:
        powershell -ExecutionPolicy Bypass -File .\run.ps1
#>
[CmdletBinding()]
param(
    [switch]$Fresh,
    [switch]$Prod,
    [switch]$SetupOnly,
    [switch]$Import,
    [switch]$SkipImport,
    [switch]$Stop,
    [switch]$Status,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$Container = 'sap_monitoring_db'
$ApiPort   = 4000
$WebPort   = 5173
$PrevPort  = 4173
$DbPort    = 5433
$Workbook  = 'ERP Monitoring Log.xlsx'

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

# Run an npm script and stop the launcher if it fails, so a broken migration
# never gets papered over by the servers starting anyway.
function Invoke-Npm {
    param([string[]]$Arguments, [string]$What)
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "$What failed (npm exited $LASTEXITCODE)." 'Scroll up for the underlying error.'
    }
}

# --- Process / port helpers --------------------------------------------------
function Get-PortOwner {
    param([int]$Port)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $conn) { return $null }
    return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

# Node processes whose command line names this project directory: the
# concurrently/vite/npm roots of a previous run. Matching on the path (rather
# than on "node.exe") is what keeps this from touching unrelated Node work.
function Get-ProjectNodeProcess {
    $root = $PSScriptRoot.ToLower()
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($root) }
}

# Tree-kill one process. Quiet on purpose: killing a parent reaps its children,
# so by the time the port sweep runs, half these PIDs are already gone and
# taskkill would print "process not found" for each one.
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

    # A child that outlived its parent still holds the port; give the tree kills
    # a moment to land first so this only catches genuine strays.
    Start-Sleep -Milliseconds 400
    foreach ($port in @($ApiPort, $WebPort, $PrevPort)) {
        $owner = Get-PortOwner -Port $port
        if ($owner -and $owner.ProcessName -eq 'node') {
            if (Invoke-TaskKill -ProcessId $owner.Id) { $killed++ }
        }
    }

    return $killed
}

# --- Docker helpers ----------------------------------------------------------

# docker writes daemon-connection failures to stderr, which would otherwise dump
# a wall of npipe text into -Status. Native commands ignore $ErrorActionPreference,
# so the redirect is what silences them; the exit code still tells us what happened.
function Invoke-DockerQuiet {
    param([string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try { $out = & docker @Arguments 2>$null } catch { $out = $null }
    $ErrorActionPreference = $previous
    return $out
}

function Test-DockerDaemon {
    Invoke-DockerQuiet -Arguments @('info', '--format', '{{.ServerVersion}}') | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Get-ContainerStatus {
    $status = Invoke-DockerQuiet -Arguments @('ps', '-a', '--filter', "name=$Container", '--format', '{{.Status}}')
    if ($LASTEXITCODE -ne 0) { return '' }
    if (-not $status) { return '' }
    return ($status | Select-Object -First 1)
}

function Wait-ForDatabase {
    param([int]$TimeoutSeconds = 120)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $status = Get-ContainerStatus
        if ($status -match 'healthy') { return $true }
        if ($status -match 'Exited|Restarting') {
            Stop-WithError "the $Container container is not staying up ($status)." "Inspect it with: docker logs $Container"
        }
        Start-Sleep -Milliseconds 1000
    }
    return $false
}

function Get-ObservationCount {
    $out = & docker exec $Container psql -U sapmon -d sap_monitoring -tAc 'SELECT count(*) FROM observations'
    if ($LASTEXITCODE -ne 0) { return -1 }
    $text = ($out | Select-Object -First 1)
    if (-not $text) { return -1 }
    $parsed = 0
    if ([int]::TryParse($text.Trim(), [ref]$parsed)) { return $parsed }
    return -1
}

# --- -Status -----------------------------------------------------------------
if ($Status) {
    Write-Host ''
    Write-Step 'SAP Monitoring System - status'

    if (-not (Test-DockerDaemon)) {
        Write-Note 'docker     daemon not responding (Docker Desktop is not running)'
    }
    else {
        $dbStatus = Get-ContainerStatus
        if ($dbStatus) { Write-Ok "database   $Container - $dbStatus" }
        else { Write-Info 'database   not created (run .\run.ps1)' }
    }

    foreach ($pair in @(@{ Name = 'API       '; Port = $ApiPort },
                        @{ Name = 'dashboard '; Port = $WebPort },
                        @{ Name = 'preview   '; Port = $PrevPort })) {
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

    if (Get-ContainerStatus) {
        & docker compose down | Out-Null
        Write-Ok 'stopped the Postgres container (the data volume is kept)'
    }
    else {
        Write-Info 'no database container was running'
    }

    Write-Host ''
    Write-Host 'Everything is down. Start again with: .\run.ps1' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# --- Preflight ---------------------------------------------------------------
Write-Host ''
Write-Host '  SAP Monitoring System' -ForegroundColor White
Write-Host '  ---------------------' -ForegroundColor DarkGray
Write-Host ''

Write-Step 'Checking prerequisites'

foreach ($tool in @(
    @{ Cmd = 'node';   Hint = 'Install Node.js 20 or newer from https://nodejs.org' },
    @{ Cmd = 'npm';    Hint = 'npm ships with Node.js - reinstall Node.js' },
    @{ Cmd = 'docker'; Hint = 'Install Docker Desktop from https://docker.com' }
)) {
    if (-not (Get-Command $tool.Cmd -ErrorAction SilentlyContinue)) {
        Stop-WithError "'$($tool.Cmd)' was not found on PATH." $tool.Hint
    }
}

if (-not (Test-DockerDaemon)) {
    Stop-WithError 'the Docker daemon is not responding.' 'Start Docker Desktop, wait for it to say "Running", then re-run this script.'
}
Write-Ok "node $(& node --version), docker daemon up"

# A previous run still holding the ports would make `npm run dev` fail with an
# unhelpful EADDRINUSE, so clear it out first.
$busy = @()
foreach ($port in @($ApiPort, $WebPort, $PrevPort)) {
    if (Get-PortOwner -Port $port) { $busy += $port }
}
if ($busy.Count -gt 0) {
    Write-Note "ports $($busy -join ', ') are already in use - stopping the previous run"
    $killed = Stop-AppProcess
    Start-Sleep -Milliseconds 700
    Write-Ok "stopped $killed process(es)"

    $stillBusy = @()
    foreach ($port in @($ApiPort, $WebPort, $PrevPort)) {
        if (Get-PortOwner -Port $port) { $stillBusy += $port }
    }
    if ($stillBusy.Count -gt 0) {
        Stop-WithError "port(s) $($stillBusy -join ', ') are held by something that is not this project." 'Close whatever owns them, or change PORT / the Vite port, then re-run.'
    }
}

# --- Dependencies ------------------------------------------------------------
if (-not (Test-Path -LiteralPath 'node_modules') -or -not (Test-Path -LiteralPath 'client\node_modules')) {
    Write-Step 'Installing dependencies (first run - this takes a minute)'
    Invoke-Npm -Arguments @('install') -What 'npm install'
    Write-Ok 'workspaces installed'
}

# --- .env --------------------------------------------------------------------
if (-not (Test-Path -LiteralPath '.env')) {
    if (Test-Path -LiteralPath '.env.example') {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
        Write-Step 'Created .env from .env.example'
        Write-Info 'every key has a working default - edit it only to wire up the real SAP API'
    }
}

# --- Database ----------------------------------------------------------------
if ($Fresh) {
    Write-Step 'Rebuilding the database from scratch (-Fresh)'
    & docker compose down -v | Out-Null
    Write-Info 'dropped the existing data volume'
}

Write-Step "Starting Postgres on port $DbPort"
& docker compose up -d | Out-Null
if ($LASTEXITCODE -ne 0) {
    Stop-WithError 'docker compose up failed.' 'Check that Docker Desktop is healthy and port 5433 is free.'
}

if (-not (Wait-ForDatabase)) {
    Stop-WithError 'the database did not become healthy in time.' "Check its log with: docker logs $Container"
}
Write-Ok "$Container is healthy"

# --- Schema ------------------------------------------------------------------
Write-Step 'Applying schema and seed data'
Invoke-Npm -Arguments @('run', 'migrate') -What 'npm run migrate'

# --- Import ------------------------------------------------------------------
$rowCount = Get-ObservationCount

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
    Write-Host 'Setup complete. Start the servers with: .\run.ps1' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# --- Servers -----------------------------------------------------------------
if ($Prod) {
    Write-Step 'Building the production client'
    Invoke-Npm -Arguments @('run', 'build') -What 'npm run build'
    $uiPort = $PrevPort
}
else {
    $uiPort = $WebPort
}

if (-not $NoBrowser) {
    # A detached waiter: the servers run in the foreground here, so the browser
    # has to be opened by something else once the port is actually listening.
    $waiter = 'for ($i = 0; $i -lt 120; $i++) { if (Get-NetTCPConnection -State Listen -LocalPort ' +
              $uiPort + ' -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 800; Start-Process ' +
              "'http://localhost:$uiPort'" + '; break }; Start-Sleep -Milliseconds 500 }'
    Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $waiter -WindowStyle Hidden | Out-Null
}

Write-Host ''
Write-Step 'Starting the application'
Write-Info "dashboard   http://localhost:$uiPort"
Write-Info "API         http://localhost:$ApiPort/api/health"
Write-Info "database    localhost:$DbPort (user sapmon, db sap_monitoring)"
Write-Host ''
Write-Host '    Press Ctrl+C to stop the servers.' -ForegroundColor Yellow
Write-Host '    The database keeps running - shut it down with: .\run.ps1 -Stop' -ForegroundColor Yellow
Write-Host ''

if ($Prod) {
    # Same three processes as `npm run dev`, but serving the built assets. Vite's
    # preview server inherits the dev proxy, so /api still reaches the API.
    & npx concurrently -n api,web,worker -c cyan,magenta,yellow 'npm run start --workspace server' "npm run preview --workspace client -- --port $PrevPort" 'npm run worker --workspace server'
}
else {
    & npm run dev
}

Write-Host ''
Write-Host 'Servers stopped. The database is still running - use .\run.ps1 -Stop to shut it down too.' -ForegroundColor Cyan
Write-Host ''
