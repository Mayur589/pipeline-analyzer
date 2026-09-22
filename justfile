open := if os() == "macos" { "open" } else { "xdg-open" }

dev:
    #!/usr/bin/env bash
    trap 'kill 0' INT TERM EXIT

    echo "Building backend"
    (cd backend && cargo build)

    echo "Starting backend..."
    ./backend/target/debug/backend &

    echo "Starting frontend..."
    (cd frontend && pnpm run dev) &

    sleep 2 && {{open}} http://localhost:5173

    wait

prod:
    #!/usr/bin/env bash
    trap 'kill 0' INT TERM EXIT

    echo "Building backend"
    (cd backend && cargo build --release)

    echo "Starting backend..."
    ./backend/target/release/backend &

    echo "Building frontend..."
    (cd frontend && pnpm run build)

    echo "Opening frontend..."
    (cd frontend && npx serve dist -l 5173) &

    sleep 2 && {{open}} http://localhost:5173

    wait


