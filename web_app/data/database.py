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
        if IS_POSTGRES:
            conn.rollback() # Clear aborted transaction state for next commands
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
    
    execute_query(conn, '''
        CREATE TABLE IF NOT EXISTS custom_cmds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            cmd_path TEXT NOT NULL,
            cmd_args TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''', commit=True)
    
    execute_query(conn, '''
        CREATE TABLE IF NOT EXISTS regex_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            pattern TEXT NOT NULL,
            stage0 TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''', commit=True)

    # Migration for regex_settings (stage0)
    try:
        execute_query(conn, 'ALTER TABLE regex_settings ADD COLUMN stage0 TEXT', commit=True)
    except Exception:
        if IS_POSTGRES: conn.rollback()
        pass

    execute_query(conn, '''
        CREATE TABLE IF NOT EXISTS benchmark_state (
            user_id INTEGER PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''', commit=True)

    execute_query(conn, '''
        CREATE TABLE IF NOT EXISTS custom_parsers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            rules_json TEXT NOT NULL,
            sample_input TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''', commit=True)

    execute_query(conn, '''
        CREATE TABLE IF NOT EXISTS explorer_state (
            user_id INTEGER PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
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

# --- Custom CMDs ---

def get_user_cmds(user_id):
    conn = get_db_connection()
    cmds = execute_query(conn, 'SELECT * FROM custom_cmds WHERE user_id = ? ORDER BY created_at ASC', (user_id,), fetchall=True)
    conn.close()
    return cmds

def create_user_cmd(user_id, name, cmd_path, cmd_args):
    conn = get_db_connection()
    execute_query(conn, 'INSERT INTO custom_cmds (user_id, name, cmd_path, cmd_args) VALUES (?, ?, ?, ?)',
                 (user_id, name, cmd_path, cmd_args), commit=True)
    conn.close()

def update_user_cmd(cmd_id, user_id, name, cmd_path, cmd_args):
    conn = get_db_connection()
    execute_query(conn, 'UPDATE custom_cmds SET name=?, cmd_path=?, cmd_args=? WHERE id=? AND user_id=?',
                 (name, cmd_path, cmd_args, cmd_id, user_id), commit=True)
    conn.close()

def delete_user_cmd(cmd_id, user_id):
    conn = get_db_connection()
    execute_query(conn, 'DELETE FROM custom_cmds WHERE id=? AND user_id=?', (cmd_id, user_id), commit=True)
    conn.close()

# --- Regex Settings ---

def get_user_regexes(user_id):
    conn = get_db_connection()
    regexes = execute_query(conn, 'SELECT * FROM regex_settings WHERE user_id = ? ORDER BY created_at ASC', (user_id,), fetchall=True)
    conn.close()
    return regexes

def create_user_regex(user_id, name, pattern, stage0=None):
    conn = get_db_connection()
    execute_query(conn, 'INSERT INTO regex_settings (user_id, name, pattern, stage0) VALUES (?, ?, ?, ?)',
                 (user_id, name, pattern, stage0), commit=True)
    conn.close()

def update_user_regex(regex_id, user_id, name, pattern, stage0=None):
    conn = get_db_connection()
    execute_query(conn, 'UPDATE regex_settings SET name=?, pattern=?, stage0=? WHERE id=? AND user_id=?',
                 (name, pattern, stage0, regex_id, user_id), commit=True)
    conn.close()

def delete_user_regex(regex_id, user_id):
    conn = get_db_connection()
    execute_query(conn, 'DELETE FROM regex_settings WHERE id=? AND user_id=?', (regex_id, user_id), commit=True)
    conn.close()

# --- Benchmark State ---

def get_benchmark_state(user_id):
    conn = get_db_connection()
    row = execute_query(conn, 'SELECT state_json FROM benchmark_state WHERE user_id = ?', (user_id,), fetchone=True)
    conn.close()
    if row:
        return json.loads(row['state_json'])
    return None

def save_benchmark_state(user_id, state):
    conn = get_db_connection()
    state_str = json.dumps(state)
    if IS_POSTGRES:
        execute_query(conn,
            'INSERT INTO benchmark_state (user_id, state_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) '
            'ON CONFLICT (user_id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = CURRENT_TIMESTAMP',
            (user_id, state_str), commit=True)
    else:
        execute_query(conn,
            'INSERT OR REPLACE INTO benchmark_state (user_id, state_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            (user_id, state_str), commit=True)
    conn.close()

# --- Explorer State ---
 
def get_explorer_state(user_id):
    conn = get_db_connection()
    row = execute_query(conn, 'SELECT state_json FROM explorer_state WHERE user_id = ?', (user_id,), fetchone=True)
    conn.close()
    if row:
        return json.loads(row['state_json'])
    return None
 
def save_explorer_state(user_id, state):
    conn = get_db_connection()
    state_str = json.dumps(state)
    if IS_POSTGRES:
        execute_query(conn,
            'INSERT INTO explorer_state (user_id, state_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) '
            'ON CONFLICT (user_id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = CURRENT_TIMESTAMP',
            (user_id, state_str), commit=True)
    else:
        execute_query(conn,
            'INSERT OR REPLACE INTO explorer_state (user_id, state_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            (user_id, state_str), commit=True)
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
                        prop_filters=None, filter_model_class=None,
                        metadata_search=None, metadata_regex=None):
    conn = get_db_connection()
    
    stat_sort = sort_by in ['places', 'transitions', 'arcs', 'tokens']
    has_advanced_filters = any(v is not None for v in [filter_model_class, metadata_search, metadata_regex]) or (prop_filters and len(prop_filters) > 0)
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
            
            # Evaluate dynamic property filters
            skip_net = False
            if prop_filters:
                for cond in prop_filters:
                    prop = cond.get('prop')
                    op = cond.get('op')
                    val = cond.get('val')
                    
                    if prop not in stats or val is None:
                        continue
                        
                    stat_val = stats[prop]
                    if op == '>=' and not (stat_val >= val):
                        skip_net = True; break
                    elif op == '<=' and not (stat_val <= val):
                        skip_net = True; break
                    elif op == '==' and not (stat_val == val):
                        skip_net = True; break
            
            if skip_net: continue

            if filter_model_class and filter_model_class.lower() not in str(stats.get('class', '')).lower(): continue
            
            # Metadata filters
            if metadata_search or metadata_regex:
                meta_obj = content.get('metadata', {})
                if isinstance(meta_obj, dict):
                    # Combine all metadata into one string for robust search (legacy + raw)
                    meta_raw = meta_obj.get('raw', '')
                    if not meta_raw:
                        # Legacy or other format - join all key=value pairs
                        meta_raw = "\n".join([f"{k}={v}" for k, v in meta_obj.items() if k != 'raw'])
                    
                    if metadata_search:
                        if metadata_search.lower() not in meta_raw.lower():
                            continue
                    
                    if metadata_regex:
                        import re
                        try:
                            if not re.search(metadata_regex, meta_raw, re.IGNORECASE | re.MULTILINE):
                                continue
                        except re.error:
                            pass # Skip filter on invalid regex
                else:
                    # If metadata is not a dict (e.g. legacy string), and we are searching
                    if metadata_search or metadata_regex:
                        # Simple string check if it's already a string
                        meta_str = str(meta_obj)
                        if metadata_search and metadata_search.lower() not in meta_str.lower():
                            continue
                        if metadata_regex:
                            import re
                            try:
                                if not re.search(metadata_regex, meta_str, re.IGNORECASE | re.MULTILINE):
                                    continue
                            except re.error:
                                pass
            
            net['stats'] = stats
            net['metadata'] = content.get('metadata', {})
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

# --- Custom Parsers ---

def get_all_parsers():
    conn = get_db_connection()
    parsers = execute_query(conn, 'SELECT id, name, description, rules_json, sample_input, created_at FROM custom_parsers ORDER BY created_at DESC', fetchall=True)
    conn.close()
    result = []
    for p in parsers:
        entry = dict(p)
        try:
            entry['rules'] = json.loads(entry['rules_json'])
        except Exception:
            entry['rules'] = []
        del entry['rules_json']
        result.append(entry)
    return result

def get_parser(parser_id):
    conn = get_db_connection()
    p = execute_query(conn, 'SELECT * FROM custom_parsers WHERE id = ?', (parser_id,), fetchone=True)
    conn.close()
    if p:
        entry = dict(p)
        try:
            entry['rules'] = json.loads(entry['rules_json'])
        except Exception:
            entry['rules'] = []
        del entry['rules_json']
        return entry
    return None

def save_parser(name, description, rules, sample_input=''):
    conn = get_db_connection()
    execute_query(conn, 'INSERT INTO custom_parsers (name, description, rules_json, sample_input) VALUES (?, ?, ?, ?)',
                 (name, description, json.dumps(rules), sample_input), commit=True)
    conn.close()

def update_parser(parser_id, name, description, rules, sample_input=''):
    conn = get_db_connection()
    execute_query(conn, 'UPDATE custom_parsers SET name = ?, description = ?, rules_json = ?, sample_input = ? WHERE id = ?',
                 (name, description, json.dumps(rules), sample_input, parser_id), commit=True)
    conn.close()

def delete_parser(parser_id):
    conn = get_db_connection()
    execute_query(conn, 'DELETE FROM custom_parsers WHERE id = ?', (parser_id,), commit=True)
    conn.close()
