#!/bin/bash

# Run database initialization
echo "Initializing/Migrating database..."
python init_admin.py

# Check environment
if [ "$FLASK_ENV" = "development" ]; then
    echo "Starting in DEVELOPMENT mode (Auto-Reload + Dynamic Watcher)"
    export FLASK_DEBUG=1
    
    # Background Dynamic Watcher: Handles NEW files and DELETIONS
    (
      # Initial state
      STATE=$(find web_app/templates web_app/static -type f | md5sum)
      while true; do
        sleep 2
        NEW_STATE=$(find web_app/templates web_app/static -type f | md5sum)
        if [ "$STATE" != "$NEW_STATE" ]; then
          echo "[Watcher] New file or deletion detected. Poking Gunicorn..."
          STATE=$NEW_STATE
          touch web_app/app.py
        fi
      done
    ) &

    # Use 1 worker for development
    exec gunicorn --bind 0.0.0.0:${PORT:-5002} \
                  --workers 1 \
                  --timeout 120 \
                  --reload \
                  --reload-engine=poll \
                  web_app.app:app
else
    echo "Starting in PRODUCTION mode"
    # Use more workers for production performance
    exec gunicorn --bind 0.0.0.0:${PORT:-5002} \
                  --workers 4 \
                  --timeout 120 \
                  web_app.app:app
fi
