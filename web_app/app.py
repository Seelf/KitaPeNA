import sys
import os
import multiprocessing
import queue
import sqlite3
import json
import requests
import re
import subprocess
import time   
# Author: Dawid Konarczak
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash, send_from_directory, Response, stream_with_context
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import check_password_hash, generate_password_hash

# Ensure we can import mis_core from the parent directory
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from web_app.analysis import mis as mis_core
import networkx as nx
from web_app.analysis import reachability as petri_reachability
try:
    from web_app.analysis import concurrency as petri_analysis
    from web_app.analysis import transitivity
    from web_app.analysis import coloring
except ImportError as e:
    print(f"Warning: Could not import analysis modules: {e}")
    print(f"Warning: Could not import analysis modules: {e}")
    petri_analysis = None

from web_app.analysis.benchmarking.runner import BenchmarkRunner

# --- Configuration ---
base_dir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(base_dir, 'graphs.db')

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Change this to a fixed key in production!

# Security Config
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
# app.config['SESSION_COOKIE_SECURE'] = True # Uncomment in production (HTTPS)

# Cloudflare Turnstile Config (Placeholders - Replace with Env Vars)
TURNSTILE_SITE_KEY = os.environ.get('TURNSTILE_SITE_KEY', '1x00000000000000000000AA')
TURNSTILE_SECRET_KEY = os.environ.get('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA')
TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

# Global process tracker for benchmarks
active_benchmark_process = None

def benchmark_worker(mode, algo_names, iterations, args_dict, q):
    """
    Worker function to run benchmarks in a separate process.
    """
    try:
        from web_app.analysis.benchmarking.runner import BenchmarkRunner
        runner = BenchmarkRunner()
        if mode == 'random':
            res = runner.run_suite(algo_names, **args_dict, iterations=iterations)
        else:
            # args_dict already has 'graphs'
            res = runner.run_specific(algo_names, **args_dict, iterations=iterations)
        q.put(res)
    except Exception as e:
        import traceback
        q.put({'error': str(e), 'traceback': traceback.format_exc()})

# Extensions
csrf = CSRFProtect(app)
limiter = Limiter(get_remote_address, app=app, storage_uri="memory://")
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@app.errorhandler(429)
def ratelimit_handler(e):
    return render_template('429.html', description=e.description), 429

# --- User Model ---
class User(UserMixin):
    def __init__(self, id, username, role, is_blocked):
        self.id = id
        self.username = username
        self.role = role
        self.is_blocked = is_blocked
    
    @property
    def is_active(self):
        return not self.is_blocked
    
    def can_manage(self):
        return self.role == 'admin'

@login_manager.user_loader
def load_user(user_id):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    if user:
        return User(user['id'], user['username'], user['role'], user['is_blocked'])
    return None

# --- Database Helper ---
def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    pass # Managed by init_admin.py now for Users, but tables kept here for context
    # Keeping old init_db logic is fine for other tables
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
    conn.commit()
    conn.close()

# Initialize DB
init_db()

# --- Custom C++ Algorithms API ---
CUSTOM_ALGOS_DIR = os.path.join(base_dir, 'analysis', 'custom_algos')
if not os.path.exists(CUSTOM_ALGOS_DIR):
    os.makedirs(CUSTOM_ALGOS_DIR)

@app.route('/api/algorithms', methods=['GET'])
def list_algorithms():
    """List all custom C++ algorithms."""
    algos = []
    if os.path.exists(CUSTOM_ALGOS_DIR):
        for f in os.listdir(CUSTOM_ALGOS_DIR):
            if f.endswith('.cpp'):
                name = f[:-4]
                compiled = os.path.exists(os.path.join(CUSTOM_ALGOS_DIR, f"{name}.so"))
                algos.append({'name': name, 'compiled': compiled})
    return jsonify(algos)

@app.route('/api/algorithms/<name>', methods=['GET'])
def get_algorithm_source(name):
    """Get the source code of a specific algorithm."""
    path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.cpp")
    if not os.path.exists(path):
        return jsonify({'error': 'Algorithm not found'}), 404
    try:
        with open(path, 'r') as f:
            code = f.read()
        return jsonify({'name': name, 'code': code})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/algorithms', methods=['POST'])
@csrf.exempt
def save_algorithm():
    """Save and Compile a C++ algorithm."""
    data = request.json
    name = data.get('name')
    code = data.get('code')
    
    if not name or not code:
        return jsonify({'error': 'Name and code are required'}), 400
    
    # Sanitize name
    if not re.match(r'^\w+$', name):
        return jsonify({'error': 'Invalid name. Use alphanumeric and underscores only.'}), 400

    cpp_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.cpp")
    so_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.so")
    
    try:
        # 1. Save Code
        with open(cpp_path, 'w') as f:
            f.write(code)
            
        # 2. Compile
        # clang++ -shared -fPIC -O3 -undefined dynamic_lookup -o output.so input.cpp
        cmd = [
            'clang++', 
            '-shared', '-fPIC', '-O3', 
            '-undefined', 'dynamic_lookup', 
            '-o', so_path, 
            cpp_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            return jsonify({
                'success': False, 
                'message': 'Compilation Failed', 
                'stderr': result.stderr
            }), 400
            
        return jsonify({'success': True, 'message': 'Saved and Compiled successfully.'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/algorithms/<name>', methods=['DELETE'])
@csrf.exempt
def delete_algorithm(name):
    """Delete a custom algorithm."""
    if not re.match(r'^\w+$', name):
        return jsonify({'error': 'Invalid name'}), 400
        
    cpp_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.cpp")
    so_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.so")
    
    try:
        if os.path.exists(cpp_path): os.remove(cpp_path)
        if os.path.exists(so_path): os.remove(so_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Routes ---

@app.route('/')
@login_required
def index():
    """Renders the main application page."""
    # Pass Turnstile Key if needed for some reason, or user info
    return render_template('index.html', user=current_user)

@app.route('/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute") 
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        cf_token = request.form.get('cf-turnstile-response')
        
        # 1. Verify Cloudflare Turnstile
        # In DEV/Test we might skip if dummy key, but let's implement validation logic
        if TURNSTILE_SECRET_KEY:
            try:
                verify_payload = {
                    'secret': TURNSTILE_SECRET_KEY,
                    'response': cf_token,
                    'remoteip': request.remote_addr
                }
                verify_response = requests.post(TURNSTILE_VERIFY_URL, data=verify_payload).json()
                if not verify_response.get('success', False):
                     flash("CAPTCHA verification failed. Please try again.", "danger")
                     return render_template('login.html', site_key=TURNSTILE_SITE_KEY)
            except Exception as e:
                print(f"Turnstile Error: {e}")
                # Fail open or closed? Closed for checking "kurewsko bezpieczne" requirement
                flash("Security check failed.", "danger")
                return render_template('login.html', site_key=TURNSTILE_SITE_KEY)

        # 2. Verify Credentials
        conn = get_db_connection()
        user_row = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()
        
        if user_row:
             if check_password_hash(user_row['password_hash'], password):
                 if user_row['is_blocked']:
                     flash("Account is blocked.", "danger")
                     return render_template('login.html', site_key=TURNSTILE_SITE_KEY)
                 
                 user_obj = User(user_row['id'], user_row['username'], user_row['role'], user_row['is_blocked'])
                 login_user(user_obj)
                 return redirect(url_for('index'))
        
        flash("Invalid credentials.", "danger")

    return render_template('login.html', site_key=TURNSTILE_SITE_KEY)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/api/solve', methods=['POST'])
def solve_mis():
    """
    Solves the Maximum Independent Set problem for the provided graph.
    Streamed response (Server-Sent Events) for incremental results.
    """
    try:
        data = request.json
        
        # Check if this is a Petri Net request
        if 'places' in data and 'transitions' in data:
            def generate_petri():
                # Petri Net Reachability
                places = data.get('places', [])
                transitions = data.get('transitions', [])
                arcs = data.get('arcs', [])
                
                # Calculate Reachability Graph
                nodes_out, edges_out = petri_reachability.calculate_reachability_graph(places, transitions, arcs)
                
                # Yield Graph Structure
                graph_data = {
                    'type': 'new_graph',
                    'nodes': nodes_out,
                    'edges': edges_out
                }
                yield f"data: {json.dumps(graph_data)}\n\n"
                
                # Calculate MIS on this Reachability Graph
                G_reach = nx.Graph()
                for n in nodes_out:
                    G_reach.add_node(n['id'], label=n['label'])
                for e in edges_out:
                    G_reach.add_edge(e[0], e[1])

                print(f"DEBUG: Generating MIS for Reachability Graph. Nodes: {len(nodes_out)}")
                generator = mis_core.mis_algorithm_generator(G_reach)
                count = 0
                for i, (mis_set, msg) in enumerate(generator):
                     count += 1
                     print(f"DEBUG: Yielding MIS step {i}: {mis_set}")
                     step_data = {
                         'mis': list(mis_set),
                         'message': msg,
                         'index': i
                     }
                     yield f"data: {json.dumps(step_data)}\n\n"
                     
                print(f"DEBUG: Finished yielding. Total steps: {count}")
                yield "data: [DONE]\n\n"

            return Response(stream_with_context(generate_petri()), mimetype='text/event-stream')

        # Standard MIS on Graph (Existing Logic)
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        # reconstruct graph
        G = nx.Graph()
        G.add_nodes_from(nodes)
        G.add_edges_from(edges)
        
        def generate_mis():
            # Run algorithm generator
            generator = mis_core.mis_algorithm_generator(G)
            
            for i, (mis_set, msg) in enumerate(generator):
                step_data = {
                    'mis': list(mis_set),
                    'message': msg,
                    'index': i
                }
                yield f"data: {json.dumps(step_data)}\n\n"
            
            # End of stream indicator
            yield "data: [DONE]\n\n"

        return Response(stream_with_context(generate_mis()), mimetype='text/event-stream')
        
    except Exception as e:
        print(f"Solve Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# --- Admin API ---
@app.route('/api/admin/users', methods=['GET'])
@login_required
def list_users():
    if not current_user.can_manage():
        return jsonify({'error': 'Unauthorized'}), 403
    
    conn = get_db_connection()
    users = conn.execute('SELECT id, username, role, is_blocked, created_at FROM users').fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

@app.route('/api/admin/users', methods=['POST'])
@login_required
def add_user():
    if not current_user.can_manage():
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'user')
    
    if not username or not password:
        return jsonify({'error': 'Missing fields'}), 400
        
    pwhash = generate_password_hash(password)
    
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                     (username, pwhash, role))
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username exists'}), 400
    finally:
        conn.close()
        
    return jsonify({'status': 'success'})

@app.route('/api/admin/users/<int:user_id>/block', methods=['POST'])
@login_required
def block_user(user_id):
    if not current_user.can_manage():
        return jsonify({'error': 'Unauthorized'}), 403
    
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot block yourself'}), 400

    data = request.json
    block_status = data.get('block', True)
    
    conn = get_db_connection()
    conn.execute('UPDATE users SET is_blocked = ? WHERE id = ?', (1 if block_status else 0, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success'})

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    if not current_user.can_manage():
        return jsonify({'error': 'Unauthorized'}), 403

    if user_id == current_user.id:
        return jsonify({'error': 'Cannot delete yourself'}), 400
        
    conn = get_db_connection()
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success'})

@app.route('/api/admin/password', methods=['POST'])
@login_required
def change_password():
    data = request.json
    new_password = data.get('password')
    
    if not new_password:
        return jsonify({'error': 'Missing password'}), 400
        
    pwhash = generate_password_hash(new_password)
    
    conn = get_db_connection()
    conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (pwhash, current_user.id))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success'})

# --- Graph Management API ---

@app.route('/api/graphs', methods=['GET'])
def get_graphs():
    """Retrieves all saved graphs metadata."""
    conn = get_db_connection()
    graphs = conn.execute('SELECT id, name, created_at FROM graphs ORDER BY created_at DESC').fetchall()
    conn.close()
    return jsonify([dict(g) for g in graphs])

@app.route('/api/graphs/<int:graph_id>', methods=['GET'])
def get_graph(graph_id):
    """Retrieves a specific graph by ID."""
    conn = get_db_connection()
    graph = conn.execute('SELECT * FROM graphs WHERE id = ?', (graph_id,)).fetchone()
    conn.close()
    if graph is None:
        return jsonify({'error': 'Graph not found'}), 404
    return jsonify(dict(graph))

@app.route('/api/graphs', methods=['POST'])
@csrf.exempt
def save_graph():
    """Saves a new graph to the database."""
    data = request.json
    name = data.get('name')
    nodes = json.dumps(data.get('nodes'))
    edges = json.dumps(data.get('edges'))
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    conn = get_db_connection()
    conn.execute('INSERT INTO graphs (name, nodes, edges) VALUES (?, ?, ?)',
                 (name, nodes, edges))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/graphs/<int:graph_id>', methods=['DELETE'])
def delete_graph(graph_id):
    """Deletes a graph by ID."""
    conn = get_db_connection()
    conn.execute('DELETE FROM graphs WHERE id = ?', (graph_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'deleted'})

# --- Petri Net Import ---

def parse_pnh(content):
    # Handle BOM
    if content.startswith('\ufeff'):
        content = content[1:]
        
    lines = []
    for l in content.splitlines():
        clean = l.strip()
        # Skip empty lines and comments
        if not clean or clean.startswith('#') or clean.startswith('//') or clean.startswith(';'):
            continue
        lines.append(clean)
        
    if len(lines) < 3:
        raise ValueError("Invalid PNH file format")
    
    # Line 1: Number of places
    try:
        num_places_line = lines[0]
        num_places = int(num_places_line.split()[0]) # distinct split in case of comments
    except Exception as e:
        raise ValueError(f"Line 1 (Places Count): '{lines[0]}' - {str(e)}")

    # Line 2: Number of rows
    try:
        num_rows_line = lines[1]
        num_rows = int(num_rows_line.split()[0])
    except Exception as e:
         raise ValueError(f"Line 2 (Rows Count): '{lines[1]}' - {str(e)}")
    
    # Determine number of transitions. 
    # Spec implies last row is marking.
    num_transitions = num_rows - 1
    
    places = [{'id': i, 'tokens': 0, 'label': f'p{i}'} for i in range(num_places)]
    transitions = [{'id': i, 'label': f't{i}'} for i in range(num_transitions)]
    arcs = []
    
    # Parse Matrix
    for t_idx in range(num_transitions):
        line_idx = 2 + t_idx
        if line_idx >= len(lines): break
        
        current_line = lines[line_idx]
        try:
            # Check if space separated or dense
            if ' ' in current_line:
                 row_vals = list(map(int, current_line.split()))
            else:
                 # Dense format: '1', '0', 'x' -> 1, 0, -1
                 row_vals = []
                 for char in current_line:
                     if char == '1': row_vals.append(1)
                     elif char == '0': row_vals.append(0)
                     elif char == 'x' or char == 'X': row_vals.append(-1)
                     else: row_vals.append(0) # Treat unknowns as 0
            
            for p_idx, val in enumerate(row_vals):
                if p_idx >= num_places: break
                
                if val == -1:
                        # Place -> Transition
                        arcs.append({
                            'sourceId': p_idx,
                            'targetId': t_idx,
                            'type': 'place_to_transition',
                            'weight': 1
                        })
                elif val == 1:
                        # Transition -> Place
                        arcs.append({
                            'sourceId': t_idx,
                            'targetId': p_idx,
                            'type': 'transition_to_place',
                            'weight': 1
                        })
        except Exception as e:
             raise ValueError(f"Line {line_idx+1} (Matrix Row {t_idx}): '{current_line}' - {str(e)}")
    
    # Parse Marking (Last row logic)
    marking_row_idx = 2 + num_transitions
    if marking_row_idx < len(lines):
        try:
            line_content = lines[marking_row_idx]
            if ' ' in line_content:
                marking_vals = list(map(int, line_content.split()))
            else:
                # Dense marking? Usually marking is just numbers 0/1, but could be tokens > 1
                # If dense, assume 1 char = 1 digit token count? 
                # Or maybe it is just 0/1 marking? 
                # For safety, let's assume single digit tokens if dense.
                marking_vals = []
                for char in line_content:
                    if char.isdigit(): marking_vals.append(int(char))
                    else: marking_vals.append(0)

            for p_idx, tokens in enumerate(marking_vals):
                if p_idx < len(places):
                    places[p_idx]['tokens'] = tokens
        except Exception as e:
             raise ValueError(f"Line {marking_row_idx+1} (Marking): '{lines[marking_row_idx]}' - {str(e)}")
                
    return {'places': places, 'transitions': transitions, 'arcs': arcs}

@app.route('/api/petri/import', methods=['POST'])
@csrf.exempt
def import_petri():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
    if file:
        content = file.read().decode('utf-8')
        try:
            data = parse_pnh(content)
            return jsonify({'status': 'success', **data})
        except ValueError as e:
            return jsonify({'status': 'error', 'message': str(e)}), 400
    
    return jsonify({'status': 'error', 'message': 'Unknown error'}), 500

@app.route('/api/pnh', methods=['GET'])
def list_pnh_files():
    """Lists .pnh files in the web_app/pnh_files/ directory."""
    pnh_dir = os.path.join(base_dir, 'pnh_files')
    if not os.path.exists(pnh_dir):
        os.makedirs(pnh_dir)
    
    files = []
    for f in os.listdir(pnh_dir):
        if f.endswith('.pnh'):
            f_path = os.path.join(pnh_dir, f)
            files.append({
                'name': f,
                'mtime': os.path.getmtime(f_path),
                'size': os.path.getsize(f_path)
            })
    
    # Sort by mtime descending
    files.sort(key=lambda x: x['mtime'], reverse=True)
    return jsonify(files)

# --- Petri Net Database API ---

@app.route('/api/petri/saved', methods=['GET'])
def get_saved_petri_nets():
    """Retrieves all saved Petri nets metadata."""
    conn = get_db_connection()
    nets = conn.execute('SELECT id, name, created_at FROM petri_nets ORDER BY created_at DESC').fetchall()
    conn.close()
    return jsonify([dict(n) for n in nets])

@app.route('/api/petri/saved/<int:net_id>', methods=['GET'])
def get_saved_petri_net(net_id):
    """Retrieves a specific Petri net by ID."""
    conn = get_db_connection()
    net = conn.execute('SELECT * FROM petri_nets WHERE id = ?', (net_id,)).fetchone()
    conn.close()
    if net is None:
        return jsonify({'error': 'Petri net not found'}), 404
    return jsonify(dict(net))

@app.route('/api/petri', methods=['GET'])
def get_petri_nets():
    """Retrieves all saved Petri nets metadata."""
    conn = get_db_connection()
    nets = conn.execute('SELECT id, name, created_at FROM petri_nets ORDER BY created_at DESC').fetchall()
    conn.close()
    return jsonify([dict(n) for n in nets])

@app.route('/api/petri/saved', methods=['POST'])
@csrf.exempt
def save_petri_net():
    """Saves a new Petri net to the database."""
    data = request.json
    name = data.get('name')
    content = json.dumps(data.get('content')) # places, transitions, arcs
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    conn = get_db_connection()
    conn.execute('INSERT INTO petri_nets (name, content_json) VALUES (?, ?)',
                 (name, content))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/petri/saved/<int:net_id>', methods=['DELETE'])
def delete_petri_net(net_id):
    """Deletes a Petri net by ID."""
    conn = get_db_connection()
    conn.execute('DELETE FROM petri_nets WHERE id = ?', (net_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'deleted'})

def export_pnh(data):
    """
    Converts a dictionary (places, transitions, arcs) to PNH string format.
    """
    places = data.get('places', [])
    transitions = data.get('transitions', [])
    arcs = data.get('arcs', [])
    
    num_places = len(places)
    num_transitions = len(transitions)
    
    lines = []
    
    # Header
    lines.append(f"{num_places} places")
    lines.append(f"{num_transitions + 1} rows") # +1 for marking
    
    # Sort places and transitions by ID to ensure consistency
    places.sort(key=lambda x: x['id'])
    transitions.sort(key=lambda x: x['id'])
    
    p_map = {p['id']: i for i, p in enumerate(places)}
    t_map = {t['id']: i for i, t in enumerate(transitions)}
    
    # Build Matrix for each transition
    for t in transitions:
        row = [0] * num_places
        
        # Incoming arcs (Place -> Transition): -1
        for arc in arcs:
            if arc['type'] == 'place_to_transition' and arc['targetId'] == t['id']:
                pid = arc['sourceId']
                if pid in p_map:
                    row[p_map[pid]] = -1
                    
        # Outgoing arcs (Transition -> Place): +1
        for arc in arcs:
            if arc['type'] == 'transition_to_place' and arc['sourceId'] == t['id']:
                pid = arc['targetId']
                if pid in p_map:
                    row[p_map[pid]] = 1
        
        # Format row (dense or space separated? PNH examples used space)
        # 1 -1 0 0 ...
        lines.append(" ".join(map(str, row)))
        
    # Initial Marking (Last row)
    marking_row = [0] * num_places
    for p in places:
        if p['id'] in p_map:
            marking_row[p_map[p['id']]] = p.get('tokens', 0)
            
    lines.append(" ".join(map(str, marking_row)))
    
    return "\n".join(lines)

@app.route('/api/petri/import_batch', methods=['POST'])
@csrf.exempt
def import_petri_batch():
    if 'files' not in request.files:
        return jsonify({'status': 'error', 'message': 'No files part'}), 400
    files = request.files.getlist('files')
    if not files:
        return jsonify({'status': 'error', 'message': 'No selected files'}), 400

    imported_count = 0
    errors = []

    conn = get_db_connection()
    for file in files:
        if file and file.filename.lower().endswith('.pnh'):
             try:
                 content = file.read().decode('utf-8')
                 data = parse_pnh(content)
                 
                 # Construct name from filename
                 name = file.filename
                 if name.lower().endswith('.pnh'): name = name[:-4]
                 
                 content_json = json.dumps(data)
                 conn.execute('INSERT INTO petri_nets (name, content_json) VALUES (?, ?)', (name, content_json))
                 imported_count += 1
             except Exception as e:
                 errors.append(f"{file.filename}: {str(e)}")
    
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success', 'imported_count': imported_count, 'errors': errors})

@app.route('/api/petri/reachability', methods=['POST'])
@csrf.exempt
def calculate_reachability():
    """Calculates the Reachability Graph and returns nodes/edges directly."""
    try:
        data = request.json
        places = data.get('places', [])
        transitions = data.get('transitions', [])
        arcs = data.get('arcs', [])
        max_states = int(data.get('max_states', 100)) # Default 100, ensure int
        
        # Calculate Reachability Graph
        nodes_out, edges_out, truncated = petri_reachability.calculate_reachability_graph(places, transitions, arcs, max_states)
        
        return jsonify({
            'status': 'success',
            'nodes': nodes_out,
            'edges': edges_out,
            'truncated': truncated
        })
    except Exception as e:
        print(f"Reachability Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500



# --- Reachability Graph API ---
# petri_reachability is already imported at the top

@app.route('/api/petri/concurrency', methods=['POST'])
@csrf.exempt
def calculate_concurrency():
    """Calculates the Concurrency Place Relation Graph."""
    try:
        data = request.json
        places = data.get('places', [])
        transitions = data.get('transitions', [])
        arcs = data.get('arcs', [])
        
        if petri_analysis is None:
            return jsonify({'status': 'error', 'message': 'Petri Analysis module not available (Import Error). Check server logs.'}), 500

        nodes, edges = petri_analysis.build_concurrency_graph(places, transitions, arcs)
        
        return jsonify({
            'status': 'success',
            'nodes': nodes,
            'edges': edges
        })
    except Exception as e:
        print(f"Concurrency Analysis Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/analysis/transitivity', methods=['POST'])
@csrf.exempt
def check_transitivity():
    """Checks if the graph is Transitively Orientable."""
    try:
        data = request.json
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        result = transitivity.check_transitive_orientability(nodes, edges)
        
        return jsonify({
            'status': 'success',
            **result
        })
    except Exception as e:
        print(f"Transitivity Analysis Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/analysis/coloring', methods=['POST'])
@csrf.exempt
def get_coloring():
    """Computes Optimal Coloring."""
    try:
        data = request.json
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        result = coloring.get_optimal_coloring(nodes, edges)
        
        return jsonify({
            'status': 'success',
            **result
        })
    except Exception as e:
        print(f"Coloring Analysis Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/benchmark/stop', methods=['POST'])
@csrf.exempt
def stop_benchmark():
    global active_benchmark_process
    if active_benchmark_process and active_benchmark_process.is_alive():
        print(f"[Server] Force stopping benchmark process (PID: {active_benchmark_process.pid})...")
        active_benchmark_process.terminate()
        active_benchmark_process.join(timeout=2)
        if active_benchmark_process.is_alive():
            active_benchmark_process.kill() # Harder kill if terminate failed
        active_benchmark_process = None
        return jsonify({'status': 'stopped'})
    return jsonify({'status': 'no_active_benchmark'})

@app.route('/api/benchmark', methods=['POST'])
@csrf.exempt
def run_benchmark():
    global active_benchmark_process
    try:
        from web_app.analysis.benchmarking.runner import BenchmarkRunner
        
        data = request.json
        mode = data.get('mode', 'random') # 'random' or 'saved'
        iterations = int(data.get('iterations', 5))
        
        iterations = int(data.get('iterations', 5))
    
        # Algorithm Selection
        algo_names = data.get('algorithms', [])
        
        # Legacy Fallback
        if not algo_names:
            if data.get('algoPyColoring'): algo_names.append('python_coloring')
            if data.get('algoCpp'): algo_names.append('cpp_solve')
            if data.get('algoCppDSatur'): algo_names.append('cpp_dsatur')
        
        if not algo_names:
            return jsonify({'error': 'No algorithms selected'}), 400

        runner = BenchmarkRunner()
        
        if mode == 'saved':
            graph_ids = data.get('graph_ids', [])
            if not graph_ids:
                 return jsonify({'error': 'No graphs selected'}), 400
            
            # Fetch from DB
            conn = get_db_connection()
            # Prepare placeholders securely
            placeholders = ','.join('?' for _ in graph_ids)
            query = f'SELECT id, name, nodes, edges FROM graphs WHERE id IN ({placeholders})'
            rows = conn.execute(query, graph_ids).fetchall()
            conn.close()
            
            graphs = []
            for r in rows:
                try:
                    g_nodes = json.loads(r['nodes'])
                    g_edges = json.loads(r['edges'])
                    
                    # NORMALIZE EDGES: Handle both [u,v] lists and {source:u, target:v} dicts
                    norm_edges = []
                    for e in g_edges:
                        if isinstance(e, dict):
                            # Handle dict format
                            s = e.get('source')
                            t = e.get('target')
                            norm_edges.append([s, t])
                        elif isinstance(e, list) and len(e) >= 2:
                            norm_edges.append([e[0], e[1]])
                        else:
                            # Skip invalid
                            pass
                            
                    graphs.append({'id': r['id'], 'name': r['name'], 'nodes': g_nodes, 'edges': norm_edges})
                except Exception as e:
                    print(f"Error parsing graph {r['id']}: {e}")

            if not graphs:
                return jsonify({'error': 'No valid graphs found or parsing failed.'}), 404
                
        elif mode == 'petri':
            petri_ids = data.get('petri_ids', [])
            if not petri_ids:
                return jsonify({'error': 'No Petri nets selected'}), 400

            conn = get_db_connection()
            placeholders = ','.join('?' for _ in petri_ids)
            query = f'SELECT id, name, content_json FROM petri_nets WHERE id IN ({placeholders})'
            rows = conn.execute(query, petri_ids).fetchall()
            conn.close()

            petri_graph_type = data.get('petri_graph_type', 'concurrency')

            graphs = []
            for r in rows:
                try:
                    content = json.loads(r['content_json'])
                    
                    # Generate Temp PNH File
                    pnh_str = export_pnh(content)
                    temp_dir = os.path.join(base_dir, 'temp_pnh')
                    if not os.path.exists(temp_dir):
                        os.makedirs(temp_dir)
                    
                    pnh_filename = f"petri_{r['id']}_{int(time.time())}.pnh"
                    pnh_path = os.path.abspath(os.path.join(temp_dir, pnh_filename))
                    
                    with open(pnh_path, 'w') as f:
                        f.write(pnh_str)

                    nodes = []
                    edges = []
                    
                    if petri_graph_type == 'reachability':
                        # Use Reachability Graph
                        r_nodes, r_edges, _ = petri_reachability.calculate_reachability_graph(
                            content.get('places', []),
                            content.get('transitions', []),
                            content.get('arcs', [])
                        )
                        nodes = r_nodes
                        edges = [[e[0], e[1]] for e in r_edges]
                    elif petri_graph_type == 'pnh':
                        # Pass PNH Path directly to researcher's C++ code
                        graphs.append({
                            'id': r['id'],
                            'name': r['name'] + " (PNH)",
                            'pnh_path': pnh_path,
                            'nodes': [],
                            'edges': []
                        })
                        continue # Skip standard graph processing
                    else:
                        # Default: Concurrency Graph
                        if petri_analysis:
                            c_nodes, c_edges = petri_analysis.build_concurrency_graph(
                                content.get('places', []),
                                content.get('transitions', []),
                                content.get('arcs', [])
                            )
                            nodes = c_nodes
                            edges = []
                            for e in c_edges:
                                if isinstance(e, dict):
                                    edges.append([e['source'], e['target']])
                                elif isinstance(e, list):
                                    edges.append([e[0], e[1]])
                        else:
                             print("Petri analysis module missing.")

                    graphs.append({
                        'id': r['id'], 
                        'name': f"RG: {r['name']}", 
                        'nodes': nodes, 
                        'edges': edges,
                        'pnh_path': pnh_path # Pass the path
                    })

                except Exception as e:
                    print(f"Error processing Petri net {r['id']}: {e}")

            if not graphs:
                 return jsonify({'error': 'No valid Petri graphs generated.'}), 404
            
        elif mode == 'pnh_files':
            filenames = data.get('filenames', [])
            if not filenames:
                 return jsonify({'error': 'No PNH files selected'}), 400
            
            pnh_dir = os.path.join(base_dir, 'pnh_files')
            graphs = []
            for fname in filenames:
                p_path = os.path.abspath(os.path.join(pnh_dir, fname))
                if not os.path.exists(p_path): continue
                
                graphs.append({
                    'id': fname,
                    'name': fname,
                    'pnh_path': p_path,
                    'nodes': [],
                    'edges': []
                })
            
            if not graphs:
                 return jsonify({'error': 'No valid PNH files found.'}), 404
            
        elif mode == 'random':
            # Nothing special here, just data gathering for worker
            pass

        # --- Common Multi-processing Execution Logic ---
        q = multiprocessing.Queue()
        
        # Prepare execution args
        exec_args = {}
        if mode == 'random':
            exec_args = {
                'start_n': int(data.get('start_n', 10)),
                'end_n': int(data.get('end_n', 50)),
                'step_n': int(data.get('step_n', 10)),
                'density': float(data.get('density', 0.5))
            }
        else:
            # saved, petri, pnh_files use graphs list
            exec_args = {'graphs': graphs}

        p = multiprocessing.Process(target=benchmark_worker, args=(mode, algo_names, iterations, exec_args, q))
        active_benchmark_process = p
        p.start()
        
        result = None
        while p.is_alive():
            try:
                # Poll queue while process is running
                result = q.get(timeout=0.2)
                break
            except Exception:
                # Check if we should abort (if active_benchmark_process was set to None by the stop endpoint)
                if active_benchmark_process is None:
                    # The stop endpoint already killed the process, just return error to FE
                    return jsonify({'error': 'Benchmark stopped by user.'}), 400
                continue
        
        # Final check if result was missed
        if result is None:
            try:
                result = q.get(timeout=0.5)
            except Exception:
                pass
                
        active_benchmark_process = None
        
        if result:
            if 'error' in result:
                return jsonify(result), 500
            return jsonify(result)
        else:
            return jsonify({'error': 'Process terminated or failed to return results.'}), 500

    except Exception as e:
        print(f"Benchmark Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    port = 5002 # Changed to 5002 to avoid conflicts
    print(f"Server running on http://localhost:{port}")
    app.run(debug=True, port=port)
