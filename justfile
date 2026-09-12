set windows-shell := ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]

open := if os() == "macos" { "open" } else if os() == "windows" { "cmd /c start" } else { "xdg-open" }

# Start development servers
[unix]
dev:
    #!/usr/bin/env bash
    trap 'kill 0' INT TERM EXIT

    echo "Building backend"
    (cd backend && cargo build)

    echo "Starting backend..."
    ./backend/target/debug/backend &

    echo "Starting frontend..."
    (cd frontend && npm run dev) &

    sleep 2 && {{ open }} http://localhost:5173

    wait

# Start development servers
[script('powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File')]
[windows]
dev:
    Write-Host "Building backend..."
    Push-Location backend
    cargo build
    $cargoExit = $LASTEXITCODE
    Pop-Location
    if ($cargoExit -ne 0) { exit $cargoExit }

    try {
        Write-Host "Starting backend..."
        $backend = Start-Process -FilePath "$pwd\backend\target\debug\backend.exe" -WorkingDirectory "$pwd" -PassThru -NoNewWindow

        Write-Host "Starting frontend..."
        $frontend = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm", "run", "dev" -WorkingDirectory "$pwd\frontend" -PassThru -NoNewWindow

        Start-Sleep -Seconds 2
        Start-Process "http://localhost:5173"

        while (-not $backend.HasExited -and -not $frontend.HasExited) {
            Start-Sleep -Milliseconds 500
        }
    }
    finally {
        try {
            if ($backend -and -not $backend.HasExited) {
                cmd.exe /c "taskkill /pid $($backend.Id) /t /f >nul 2>&1"
            }
        } catch {}
        try {
            if ($frontend -and -not $frontend.HasExited) {
                cmd.exe /c "taskkill /pid $($frontend.Id) /t /f >nul 2>&1"
            }
        } catch {}
    }

# Build and start production servers
[unix]
prod:
    #!/usr/bin/env bash
    trap 'kill 0' INT TERM EXIT

    echo "Building backend"
    (cd backend && cargo build --release)

    echo "Starting backend..."
    ./backend/target/release/backend &

    echo "Building frontend..."
    (cd frontend && npm run build)

    echo "Opening frontend..."
    (cd frontend && npx serve dist -l 5173) &

    sleep 2 && {{ open }} http://localhost:5173

    wait

# Build and start production servers
[script('powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File')]
[windows]
prod:
    Write-Host "Building backend (release)..."
    Push-Location backend
    cargo build --release
    $cargoExit = $LASTEXITCODE
    Pop-Location
    if ($cargoExit -ne 0) { exit $cargoExit }

    Write-Host "Building frontend..."
    Push-Location frontend
    cmd.exe /c npm run build
    $frontendExit = $LASTEXITCODE
    Pop-Location
    if ($frontendExit -ne 0) { exit $frontendExit }

    try {
        Write-Host "Starting backend..."
        $backend = Start-Process -FilePath "$pwd\backend\target\release\backend.exe" -WorkingDirectory "$pwd" -PassThru -NoNewWindow

        Write-Host "Opening frontend..."
        $frontend = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx", "serve", "dist", "-l", "5173" -WorkingDirectory "$pwd\frontend" -PassThru -NoNewWindow

        Start-Sleep -Seconds 2
        Start-Process "http://localhost:5173"

        while (-not $backend.HasExited -and -not $frontend.HasExited) {
            Start-Sleep -Milliseconds 500
        }
    }
    finally {
        try {
            if ($backend -and -not $backend.HasExited) {
                cmd.exe /c "taskkill /pid $($backend.Id) /t /f >nul 2>&1"
            }
        } catch {}
        try {
            if ($frontend -and -not $frontend.HasExited) {
                cmd.exe /c "taskkill /pid $($frontend.Id) /t /f >nul 2>&1"
            }
        } catch {}
    }
