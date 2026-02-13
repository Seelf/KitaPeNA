import sqlite3
import os
import json

# Path configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'graphs.db')

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database tables."""
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS graphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            nodes TEXT NOT NULL,
            edges TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS petri_nets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Users table is managed by init_admin.py mostly, but we can ensure it exists
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

# --- Users ---

def get_user_by_id(user_id):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    return user

def get_user_by_username(username):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()
    return user

def get_all_users():
    conn = get_db_connection()
    users = conn.execute('SELECT id, username, role, is_blocked, created_at FROM users').fetchall()
    conn.close()
    return [dict(u) for u in users]

def create_user(username, pwhash, role='user'):
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                     (username, pwhash, role))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def update_user_block_status(user_id, is_blocked):
    conn = get_db_connection()
    conn.execute('UPDATE users SET is_blocked = ? WHERE id = ?', (1 if is_blocked else 0, user_id))
    conn.commit()
    conn.close()

def delete_user(user_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()

def update_user_password(user_id, pwhash):
    conn = get_db_connection()
    conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (pwhash, user_id))
    conn.commit()
    conn.close()

# --- Graphs (Standard) ---

def get_all_graphs():
    conn = get_db_connection()
    graphs = conn.execute('SELECT id, name, created_at FROM graphs ORDER BY created_at DESC').fetchall()
    conn.close()
    return [dict(g) for g in graphs]

def get_graph(graph_id):
    conn = get_db_connection()
    graph = conn.execute('SELECT * FROM graphs WHERE id = ?', (graph_id,)).fetchone()
    conn.close()
    return dict(graph) if graph else None

def save_graph(name, nodes, edges):
    conn = get_db_connection()
    conn.execute('INSERT INTO graphs (name, nodes, edges) VALUES (?, ?, ?)',
                 (name, json.dumps(nodes), json.dumps(edges)))
    conn.commit()
    conn.close()

def delete_graph(graph_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM graphs WHERE id = ?', (graph_id,))
    conn.commit()
    conn.close()

# --- Petri Nets ---

def get_all_petri_nets(limit=None, offset=0, search_query=None, sort_by='created_at', order='DESC'):
    conn = get_db_connection()
    
    # Base query
    query = 'SELECT id, name, content_json, created_at FROM petri_nets'
    params = []
    
    # Filtering
    if search_query:
        query += ' WHERE name LIKE ?'
        params.append(f'%{search_query}%')
        
    # Sorting
    if sort_by not in ['created_at', 'name']:
        sort_by = 'created_at'
    if order.upper() not in ['ASC', 'DESC']:
        order = 'DESC'
        
    query += f' ORDER BY {sort_by} {order}'
    
    # Pagination
    if limit is not None:
        query += ' LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        
    rows = conn.execute(query, params).fetchall()
    
    # Get total count for pagination metadata
    count_query = 'SELECT COUNT(*) FROM petri_nets'
    count_params = []
    if search_query:
        count_query += ' WHERE name LIKE ?'
        count_params.append(f'%{search_query}%')
        
    total_count = conn.execute(count_query, count_params).fetchone()[0]
    
    conn.close()
    
    results = []
    for row in rows:
        net = dict(row)
        try:
            content = json.loads(net['content_json'])
            # Extract stats
            places = content.get('places', [])
            transitions = content.get('transitions', [])
            arcs = content.get('arcs', [])
            model_class = content.get('model_class', '')
            
            net['stats'] = {
                'places': len(places),
                'transitions': len(transitions),
                'arcs': len(arcs),
                'class': model_class
            }
            # Remove content_json from list response to save bandwidth
            del net['content_json'] 
        except:
            net['stats'] = {'places': 0, 'transitions': 0, 'arcs': 0, 'class': ''}
            
        results.append(net)
        
    return {'nets': results, 'total': total_count}

def get_petri_net(net_id):
    conn = get_db_connection()
    net = conn.execute('SELECT * FROM petri_nets WHERE id = ?', (net_id,)).fetchone()
    conn.close()
    return dict(net) if net else None

def save_petri_net(name, content):
    conn = get_db_connection()
    conn.execute('INSERT INTO petri_nets (name, content_json) VALUES (?, ?)',
                 (name, json.dumps(content)))
    conn.commit()
    conn.close()

def update_petri_net(net_id, name, content):
    conn = get_db_connection()
    conn.execute('UPDATE petri_nets SET name = ?, content_json = ? WHERE id = ?',
                 (name, json.dumps(content), net_id))
    conn.commit()
    conn.close()

def delete_petri_net(net_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM petri_nets WHERE id = ?', (net_id,))
    conn.commit()
    conn.close()
