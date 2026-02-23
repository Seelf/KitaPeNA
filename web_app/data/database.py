import sqlite3
import os
import json

# Path configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'graphs.db')

# PostgreSQL config
PG_USER = os.environ.get("POSTGRES_USER")
PG_PASS = os.environ.get("POSTGRES_PASSWORD")
PG_HOST = os.environ.get("POSTGRES_HOST")
PG_DB = os.environ.get("POSTGRES_DB")

IS_POSTGRES = bool(PG_HOST and PG_USER)

if IS_POSTGRES:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    IntegrityError = psycopg2.IntegrityError
else:
    IntegrityError = sqlite3.IntegrityError

def get_db_connection():
    if IS_POSTGRES:
        conn = psycopg2.connect(
            host=PG_HOST,
            user=PG_USER,
            password=PG_PASS,
            dbname=PG_DB
        )
        return conn
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

def execute_query(conn, query, params=(), fetchone=False, fetchall=False, commit=False):
    if IS_POSTGRES:
        # Translate SQLite ? to PostgreSQL %s
        query = query.replace('?', '%s')
        if 'INTEGER PRIMARY KEY AUTOINCREMENT' in query:
            query = query.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY')
        if 'BOOLEAN DEFAULT 0' in query:
            query = query.replace('BOOLEAN DEFAULT 0', 'BOOLEAN DEFAULT FALSE')
            
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query, params)
        if commit:
            conn.commit()
            
        if fetchone:
            res = cursor.fetchone()
            return dict(res) if res is not None else None
            
        if fetchall:
            res = cursor.fetchall()
            return [dict(row) for row in res]
            
        return cursor
    else:
        cursor = conn.cursor()
        cursor.execute(query, params)
        if commit:
            conn.commit()
            
        if fetchone:
            res = cursor.fetchone()
            return dict(res) if res is not None else None
            
        if fetchall:
            res = cursor.fetchall()
            return [dict(row) for row in res]
            
        return cursor

def init_db():
    conn = get_db_connection()
    execute_query(conn, '''
        CREATE TABLE IF NOT EXISTS graphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            nodes TEXT NOT NULL,
            edges TEXT NOT NULL,
            is_directed BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''', commit=False)
    
    # Migration for existing graphs table
    try:
        execute_query(conn, 'ALTER TABLE graphs ADD COLUMN is_directed BOOLEAN DEFAULT 0', commit=True)
    except Exception as e:
        # Expected if column already exists
        pass
        
    execute_query(conn, '''
        CREATE TABLE IF NOT EXISTS petri_nets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''', commit=False)
    execute_query(conn, '''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_blocked BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''', commit=True)
    conn.close()

# --- Users ---

def get_user_by_id(user_id):
    conn = get_db_connection()
    user = execute_query(conn, 'SELECT * FROM users WHERE id = ?', (user_id,), fetchone=True)
    conn.close()
    return user

def get_user_by_username(username):
    conn = get_db_connection()
    user = execute_query(conn, 'SELECT * FROM users WHERE username = ?', (username,), fetchone=True)
    conn.close()
    return user

def get_all_users():
    conn = get_db_connection()
    users = execute_query(conn, 'SELECT id, username, role, is_blocked, created_at FROM users', fetchall=True)
    conn.close()
    return users

def create_user(username, pwhash, role='user'):
    conn = get_db_connection()
    try:
        execute_query(conn, 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                     (username, pwhash, role), commit=True)
        return True
    except IntegrityError:
        return False
    finally:
        conn.close()

def update_user_block_status(user_id, is_blocked):
    conn = get_db_connection()
    val = True if is_blocked else False
    if not IS_POSTGRES: val = 1 if is_blocked else 0
    execute_query(conn, 'UPDATE users SET is_blocked = ? WHERE id = ?', (val, user_id), commit=True)
    conn.close()

def delete_user(user_id):
    conn = get_db_connection()
    execute_query(conn, 'DELETE FROM users WHERE id = ?', (user_id,), commit=True)
    conn.close()

def update_user_password(user_id, pwhash):
    conn = get_db_connection()
    execute_query(conn, 'UPDATE users SET password_hash = ? WHERE id = ?', (pwhash, user_id), commit=True)
    conn.close()

# --- Graphs (Standard) ---

def get_all_graphs():
    conn = get_db_connection()
    graphs = execute_query(conn, "SELECT * FROM graphs", fetchall=True)
    conn.close()
    return graphs

def get_graph(graph_id):
    conn = get_db_connection()
    graph = execute_query(conn, 'SELECT * FROM graphs WHERE id = ?', (graph_id,), fetchone=True)
    conn.close()
    return graph

def save_graph(name, nodes, edges, is_directed=False):
    conn = get_db_connection()
    val = True if is_directed else False
    if not IS_POSTGRES: val = 1 if is_directed else 0
    execute_query(conn, 'INSERT INTO graphs (name, nodes, edges, is_directed) VALUES (?, ?, ?, ?)',
                 (name, json.dumps(nodes), json.dumps(edges), val), commit=True)
    conn.close()

def delete_graph(graph_id):
    conn = get_db_connection()
    execute_query(conn, 'DELETE FROM graphs WHERE id = ?', (graph_id,), commit=True)
    conn.close()

# --- Petri Nets ---

def get_all_petri_nets(limit=None, offset=0, search_query=None, sort_by='created_at', order='DESC', 
                        min_places=None, min_transitions=None, min_arcs=None, min_tokens=None):
    conn = get_db_connection()
    
    stat_sort = sort_by in ['places', 'transitions', 'arcs', 'tokens']
    has_advanced_filters = any(v is not None for v in [min_places, min_transitions, min_arcs, min_tokens])
    use_python_logic = has_advanced_filters or stat_sort
    
    query = 'SELECT id, name, content_json, created_at FROM petri_nets'
    params = []
    
    if search_query:
        query += ' WHERE name LIKE ?'
        params.append(f'%{search_query}%')
        
    if not stat_sort:
        if sort_by not in ['created_at', 'name']:
            sort_by = 'created_at'
        if order.upper() not in ['ASC', 'DESC']:
            order = 'DESC'
        query += f' ORDER BY {sort_by} {order}'
    else:
        query += ' ORDER BY created_at DESC'
    
    if not use_python_logic and limit is not None:
        query += ' LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        
    results_raw = execute_query(conn, query, tuple(params), fetchall=True)
    
    results = []
    for row in results_raw:
        net = row
        try:
            content = json.loads(net['content_json'])
            places = content.get('places', [])
            transitions = content.get('transitions', [])
            arcs = content.get('arcs', [])
            model_class = content.get('model_class', '')
            
            total_tokens = sum(p.get('tokens', 0) for p in places)
            
            stats = {
                'places': len(places),
                'transitions': len(transitions),
                'arcs': len(arcs),
                'tokens': total_tokens,
                'class': model_class
            }
            
            if min_places is not None and stats['places'] < min_places: continue
            if min_transitions is not None and stats['transitions'] < min_transitions: continue
            if min_arcs is not None and stats['arcs'] < min_arcs: continue
            if min_tokens is not None and stats['tokens'] < min_tokens: continue
            
            net['stats'] = stats
            del net['content_json']
            results.append(net)
        except Exception:
            if not use_python_logic:
                net['stats'] = {'places': 0, 'transitions': 0, 'arcs': 0, 'tokens': 0, 'class': ''}
                results.append(net)

    if stat_sort:
        is_reverse = (order.upper() == 'DESC')
        results.sort(key=lambda x: x['stats'].get(sort_by, 0), reverse=is_reverse)

    total_filtered = len(results) if use_python_logic else None
    
    if use_python_logic and limit is not None:
        results = results[offset : offset + limit]
    
    if use_python_logic:
        total_count = total_filtered
    else:
        count_query = 'SELECT COUNT(*) FROM petri_nets'
        count_params = []
        if search_query:
            count_query += ' WHERE name LIKE ?'
            count_params.append(f'%{search_query}%')
        count_res = execute_query(conn, count_query, tuple(count_params), fetchone=True)
        total_count = list(count_res.values())[0] if count_res else 0
        
    conn.close()
    return {'nets': results, 'total': total_count}

def get_petri_net(net_id):
    conn = get_db_connection()
    net = execute_query(conn, 'SELECT * FROM petri_nets WHERE id = ?', (net_id,), fetchone=True)
    conn.close()
    return net

def save_petri_net(name, content):
    conn = get_db_connection()
    execute_query(conn, 'INSERT INTO petri_nets (name, content_json) VALUES (?, ?)',
                 (name, json.dumps(content)), commit=True)
    conn.close()

def update_petri_net(net_id, name, content):
    conn = get_db_connection()
    execute_query(conn, 'UPDATE petri_nets SET name = ?, content_json = ? WHERE id = ?',
                 (name, json.dumps(content), net_id), commit=True)
    conn.close()

def delete_petri_net(net_id):
    conn = get_db_connection()
    execute_query(conn, 'DELETE FROM petri_nets WHERE id = ?', (net_id,), commit=True)
    conn.close()
