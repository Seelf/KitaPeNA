"""
Docker Container Auto-Restarter (File Watcher)
----------------------------------------------
This script monitors the current directory for any file changes.
When a change is detected (e.g., you save a Python, HTML, or JS file),
it waits 1 second to ensure the write operation is complete, and then
automatically restarts the specified Docker container.

This is extremely useful for local development when your code is running
inside a Docker container (using volume mounts) but the internal server
(like Gunicorn) doesn't auto-reload on code changes.

Usage:
    Run this script in the background while coding:
    $ .venv/bin/python watch.py
"""

import os
import time
import subprocess

directory_to_watch = '.'
container_name = 'kitapena_instance'

# ANSI color codes for terminal output
COLOR_CYAN = '\033[96m'
COLOR_GREEN = '\033[92m'
COLOR_YELLOW = '\033[93m'
COLOR_RED = '\033[91m'
COLOR_RESET = '\033[0m'

def get_latest_mtime(directory):
    max_mtime = 0
    for root, dirs, files in os.walk(directory):
        # Ignore directories that frequently change internally or aren't source code
        ignored_dirs = {'.git', '.venv', '__pycache__', 'temp', 'temp_pnh', 'pnh_files', 'data'}
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        
        for f in files:
            # Ignore log files and SQLite databases to prevent infinite restart loops
            if f.endswith('.log') or f.endswith('.db') or f.endswith('.db-shm') or f.endswith('.db-wal'):
                continue
                
            path = os.path.join(root, f)
            try:
                mtime = os.path.getmtime(path)
                if mtime > max_mtime:
                    max_mtime = mtime
            except FileNotFoundError:
                # File might have been deleted during the scan
                pass
    return max_mtime

last_mtime = get_latest_mtime(directory_to_watch)
print(f"{COLOR_CYAN}Watching for file changes... (Auto-restarting Docker container: '{container_name}'){COLOR_RESET}")

while True:
    try:
        # Check for changes every 1 second
        time.sleep(1) 
        current_mtime = get_latest_mtime(directory_to_watch)
        
        if current_mtime > last_mtime:
            print(f"{COLOR_YELLOW}File changes detected! Waiting 1 second to ensure writes are finished...{COLOR_RESET}")
            # Extra 1s buffer to let IDEs or async I/O finish writing to disk
            time.sleep(1) 
            
            print(f"{COLOR_CYAN}Restarting container '{container_name}'...{COLOR_RESET}")
            subprocess.run(["docker", "restart", container_name])
            print(f"{COLOR_GREEN}Restart complete. Resuming watch...{COLOR_RESET}")
            
            # Reset the modification time tracker to prevent double-restarts
            last_mtime = get_latest_mtime(directory_to_watch)
            
    except KeyboardInterrupt:
        print(f"\n{COLOR_RED}Watcher stopped by user.{COLOR_RESET}")
        break
