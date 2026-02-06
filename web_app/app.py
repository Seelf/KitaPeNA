import sys
import os
import sqlite3
import json
from flask import Flask, render_template, request, jsonify

# Ensure we can import mis_core from the parent directory
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import mis_core
import networkx as nx

# --- Configuration ---
base_dir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(base_dir, 'graphs.db')

app = Flask(__name__)

# --- Database Helper ---
def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database schema if not present."""
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

# Initialize DB on startup
init_db()

# --- Routes ---

@app.route('/')
def index():
    """Renders the main application page."""
    return render_template('index.html')

@app.route('/api/solve', methods=['POST'])
def solve_mis():
    """
    Solves the Maximum Independent Set problem for the provided graph.
    Streamed response (Server-Sent Events) for incremental results.
    """
    try:
        data = request.json
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        # reconstruct graph
        G = nx.Graph()
        G.add_nodes_from(nodes)
        G.add_edges_from(edges)
        
        def generate():
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

        from flask import Response, stream_with_context
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
    
    places = [{'id': i+1, 'tokens': 0, 'label': f'p{i+1}'} for i in range(num_places)]
    transitions = [{'id': i+1, 'label': f't{i+1}'} for i in range(num_transitions)]
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
                            'sourceId': p_idx + 1,
                            'targetId': t_idx + 1,
                            'type': 'place_to_transition',
                            'weight': 1
                        })
                elif val == 1:
                        # Transition -> Place
                        arcs.append({
                            'sourceId': t_idx + 1,
                            'targetId': p_idx + 1,
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

@app.route('/api/petri/saved', methods=['POST'])
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

@app.route('/api/petri/import_batch', methods=['POST'])
def import_petri_batch():
    """Imports multiple PNH files and saves them to the DB."""
    if 'files' not in request.files:
        return jsonify({'status': 'error', 'message': 'No files uploaded'}), 400
    
    files = request.files.getlist('files') # Handling multiple files
    imported_count = 0
    errors = []

    conn = get_db_connection()
    try:
        for file in files:
            if file and file.filename.lower().endswith('.pnh'):
                try:
                    content = file.read().decode('utf-8')
                    parsed_data = parse_pnh(content)
                    
                    # Auto-save to DB using filename as name
                    name = os.path.splitext(file.filename)[0]
                    content_json = json.dumps(parsed_data)
                    
                    conn.execute('INSERT INTO petri_nets (name, content_json) VALUES (?, ?)',
                                 (name, content_json))
                    imported_count += 1
                except Exception as e:
                    print(f"IMPORT ERROR: {file.filename} - {str(e)}")
                    errors.append(f"{file.filename}: {str(e)}")
        
        conn.commit()
    finally:
        conn.close()

    return jsonify({
        'status': 'success', 
        'imported_count': imported_count,
        'errors': errors
    })

# --- Reachability Graph API ---

import petri_reachability

@app.route('/api/petri/reachability', methods=['POST'])
def calculate_reachability():
    """Calculates the Reachability Graph for the given Petri Net."""
    try:
        data = request.json
        places = data.get('places', [])
        transitions = data.get('transitions', [])
        arcs = data.get('arcs', [])
        
        nodes, edges = petri_reachability.calculate_reachability_graph(places, transitions, arcs)
        
        return jsonify({
            'status': 'success',
            'nodes': nodes,
            'edges': edges
        })
    except Exception as e:
        print(f"Reachability Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


if __name__ == '__main__':
    port = 5002 # Changed to 5002 to avoid conflicts
    print(f"Server running on http://localhost:{port}")
    app.run(debug=True, port=port)
