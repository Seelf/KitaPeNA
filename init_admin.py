import os
import sys
from werkzeug.security import generate_password_hash

# Ensure we can import web_app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from web_app.data.database import create_user, init_db, get_user_by_username

import time

def init_admin():
    # PostgreSQL needs a few seconds to boot up and accept connections cleanly
    max_retries = 30
    for attempt in range(max_retries):
        try:
            init_db()
            break  # If successful, exit the loop
        except Exception as e:
            print(f"Database is booting up, waiting... (Attempt {attempt + 1}/{max_retries})")
            time.sleep(2)
            if attempt == max_retries - 1:
                print("Could not connect to the database after multiple attempts.")
                raise e
    
    admin = get_user_by_username('admin')
    if admin:
        print("Admin user already exists!")
        return
        
    password = 'admin'
    pwhash = generate_password_hash(password)
    
    if create_user('admin', pwhash, 'admin'):
        print(f"Admin user created successfully with default password: {password}")
    else:
        print("Error creating admin user.")

if __name__ == '__main__':
    init_admin()
