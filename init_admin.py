from flask import Flask
from werkzeug.security import generate_password_hash
import sqlite3
import os

# Configuration
base_dir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(base_dir, 'web_app', 'graphs.db')

def init_user_table():
    conn = sqlite3.connect(db_path)
    # Create Users table with role and blocking support
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_blocked BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def seed_admin():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Check if admin exists
    cur.execute('SELECT * FROM users WHERE username = ?', ('admin',))
    if cur.fetchone():
        print("Admin user already exists. Skipping creation.")
    else:
        # Create default admin: admin / admin
        # Using pbkdf2:sha256 which is secure enough (default in werkzeug)
        pwhash = generate_password_hash('admin')
        cur.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                    ('admin', pwhash, 'admin'))
        conn.commit()
        print("Admin user created (admin / admin).")
    
    conn.close()

if __name__ == '__main__':
    print(f"Initializing Auth DB at: {db_path}")
    init_user_table()
    seed_admin()
