#!/usr/bin/env pwsh
# SAP Monitoring System - Start Script

Write-Host "Starting SAP Monitoring System..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Run migrations
Write-Host "Step 1/3: Running database migrations..." -ForegroundColor Yellow
npm run migrate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Migration failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Migrations complete" -ForegroundColor Green
Write-Host ""

# Step 2: Import Excel data
Write-Host "Step 2/3: Importing Excel data..." -ForegroundColor Yellow
npm run import
if ($LASTEXITCODE -ne 0) {
    Write-Host "Import failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Data imported" -ForegroundColor Green
Write-Host ""

# Step 3: Start the dev server
Write-Host "Step 3/3: Starting development server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "The application will start with:" -ForegroundColor Cyan
Write-Host "  - Next.js dev server: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  - Collector worker: background process" -ForegroundColor Cyan
Write-Host "  - Batch backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
npm run dev
