import multiprocessing
import queue
import time
import os
import json
from flask import Blueprint, jsonify, request
from flask_login import login_required

from web_app.data import database as db
from web_app.analysis import reachability as petri_reachability
try:
    from web_app.analysis import concurrency as petri_analysis
except ImportError:
    petri_analysis = None
from .petri.utils import export_pnh

benchmark_bp = Blueprint('benchmark', __name__)

active_benchmark_process = None
base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def benchmark_worker(mode, algo_names, iterations, args_dict, q):
    """
    Worker process for benchmarking algorithms.
    """
    try:
        from web_app.analysis.benchmarking.runner import BenchmarkRunner
        runner = BenchmarkRunner()
        if mode == 'random':
            res = runner.run_suite(algo_names, **args_dict, iterations=iterations)
        else:
            # args_dict has 'graphs'
            res = runner.run_specific(algo_names, **args_dict, iterations=iterations)
        q.put(res)
    except Exception as e:
        import traceback
        q.put({'error': str(e), 'traceback': traceback.format_exc()})

@benchmark_bp.route('/stop', methods=['POST'])
@login_required
def stop_benchmark():
    """Forces the active benchmark process to terminate."""
    global active_benchmark_process
    if active_benchmark_process and active_benchmark_process.is_alive():
        print(f"[Server] Force stopping benchmark (PID: {active_benchmark_process.pid})...")
        active_benchmark_process.terminate()
        active_benchmark_process.join(timeout=2)
        if active_benchmark_process.is_alive():
            active_benchmark_process.kill() 
        active_benchmark_process = None
        return jsonify({'status': 'stopped'})
    return jsonify({'status': 'no_active_benchmark'})

@benchmark_bp.route('', methods=['POST'])
@login_required
def run_benchmark():
    """Starts a benchmark for selected algorithms and graphs."""
    global active_benchmark_process
    try:
        data = request.json
        mode = data.get('mode', 'random') # 'random', 'saved', 'petri', 'pnh_files'
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

        if mode == 'saved':
            graph_ids = data.get('graph_ids', [])
            if not graph_ids:
                 return jsonify({'error': 'No graphs selected'}), 400
            
            # Fetch from DB
            conn = db.get_db_connection()
            placeholders = ','.join('?' for _ in graph_ids)
            query = f'SELECT id, name, nodes, edges FROM graphs WHERE id IN ({placeholders})'
            rows = conn.execute(query, graph_ids).fetchall()
            conn.close()
            
            graphs = []
            for r in rows:
                try:
                    g_nodes = json.loads(r['nodes'])
                    g_edges = json.loads(r['edges'])
                    
                    # Normalize Edges
                    norm_edges = []
                    for e in g_edges:
                        if isinstance(e, dict):
                            s = e.get('source')
                            t = e.get('target')
                            norm_edges.append([s, t])
                        elif isinstance(e, list) and len(e) >= 2:
                            norm_edges.append([e[0], e[1]])
                            
                    graphs.append({'id': r['id'], 'name': r['name'], 'nodes': g_nodes, 'edges': norm_edges})
                except Exception as e:
                    print(f"Error parsing graph {r['id']}: {e}")

            if not graphs:
                return jsonify({'error': 'No valid graphs found.'}), 404
                
        elif mode == 'petri':
            petri_ids = data.get('petri_ids', [])
            if not petri_ids:
                return jsonify({'error': 'No Petri nets selected'}), 400

            conn = db.get_db_connection()
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
                    temp_dir = os.path.join(base_dir, 'web_app', 'temp_pnh') 
                    if not os.path.exists(temp_dir):
                        os.makedirs(temp_dir)
                    
                    pnh_filename = f"petri_{r['id']}_{int(time.time())}.pnh"
                    pnh_path = os.path.abspath(os.path.join(temp_dir, pnh_filename))
                    
                    with open(pnh_path, 'w') as f:
                        f.write(pnh_str)

                    nodes = []
                    edges = []
                    
                    if petri_graph_type == 'reachability':
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
                        continue 
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
                        'pnh_path': pnh_path
                    })

                except Exception as e:
                    print(f"Error processing Petri net {r['id']}: {e}")

            if not graphs:
                 return jsonify({'error': 'No valid Petri graphs generated.'}), 404
            
        elif mode == 'pnh_files':
            filenames = data.get('filenames', [])
            if not filenames:
                 return jsonify({'error': 'No PNH files selected'}), 400
            
            pnh_dir = os.path.join(base_dir, 'web_app', 'pnh_files') 
            graphs = []
            for fname in filenames:
                # Prevent path traversal
                fname = os.path.basename(fname)
                p_path = os.path.abspath(os.path.join(pnh_dir, fname))
                if not p_path.startswith(os.path.abspath(pnh_dir)):
                    continue
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
            pass

        # --- Multiprocessing Execution ---
        q = multiprocessing.Queue()
        
        exec_args = {}
        if mode == 'random':
            exec_args = {
                'start_n': int(data.get('start_n', 10)),
                'end_n': int(data.get('end_n', 50)),
                'step_n': int(data.get('step_n', 10)),
                'density': float(data.get('density', 0.5)),
                'graph_count': int(data.get('graph_count', 5))
            }
        else:
            exec_args = {'graphs': graphs}

        p = multiprocessing.Process(target=benchmark_worker, args=(mode, algo_names, iterations, exec_args, q))
        active_benchmark_process = p
        p.start()
        
        result = None
        start_time = time.time()
        while p.is_alive():
            try:
                # Poll queue
                result = q.get(timeout=0.2)
                break
            except Exception:
                # Check if aborted
                if active_benchmark_process is None:
                    return jsonify({'error': 'Benchmark stopped by user.'}), 400
                continue
        
        # Check if result missed
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
