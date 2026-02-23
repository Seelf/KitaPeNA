import time
import statistics
import os
import ctypes
from .generator import generate_random_graph
# Import algorithms
from ..coloring import get_optimal_coloring
from ..transitivity import check_transitive_orientability

import sys
import io
import tempfile

class CaptureOutput:
    """
    Context manager to capture stdout/stderr even from C++ (at FD level).
    """
    def __init__(self):
        self.output = ""
        self._stdout_fd = 1
        self._stderr_fd = 2
        self._save_stdout = None
        self._save_stderr = None
        self._temp_file = None

    def __enter__(self):
        # Create temp file for capturing
        self._temp_file = tempfile.TemporaryFile(mode='w+t')
        
        # Save original FDs
        self._save_stdout = os.dup(self._stdout_fd)
        self._save_stderr = os.dup(self._stderr_fd)
        
        # Redirect
        os.dup2(self._temp_file.fileno(), self._stdout_fd)
        os.dup2(self._temp_file.fileno(), self._stderr_fd)
        
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Flush everything
        sys.stdout.flush()
        sys.stderr.flush()
        
        # Restore FDs
        os.dup2(self._save_stdout, self._stdout_fd)
        os.dup2(self._save_stderr, self._stderr_fd)
        
        os.close(self._save_stdout)
        os.close(self._save_stderr)
        
        # Read captured output
        self._temp_file.seek(0)
        self.output = self._temp_file.read()
        self._temp_file.close()

# Strategy Registry (User-defined only)
ALGORITHMS = {}

CUSTOM_ALGOS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'custom_algos'))

def execute_custom_cpp(algo_name, nodes, edges, is_directed=False):
    so_path = os.path.join(CUSTOM_ALGOS_DIR, f"{algo_name}.so")
    if not os.path.exists(so_path):
        raise FileNotFoundError(f"Custom algo {algo_name} not found at {so_path}")

    try:
        lib = ctypes.CDLL(so_path)
        # void solve(int nodes, int edges_count, int* u, int* v, int* colors)
        lib.solve.argtypes = [
            ctypes.c_int, ctypes.c_int, 
            ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), 
            ctypes.POINTER(ctypes.c_int)
        ]
        lib.solve.restype = ctypes.c_double

        n = len(nodes)
        m = len(edges)
        
        # Prepare Arrays
        u_arr = (ctypes.c_int * m)()
        v_arr = (ctypes.c_int * m)()
        
        # Map IDs to 0..N-1
        if nodes and isinstance(nodes[0], dict):
             id_map = {node['id']: i for i, node in enumerate(nodes)}
        else:
             id_map = {i: i for i in range(n)}

        for i, edge in enumerate(edges):
            u, v = edge
            # Handle both list/tuple and dict edges? Standardize on list from other parts
            if isinstance(u, dict): u = u['id'] # Safety
            if isinstance(v, dict): v = v['id']
            
            if u in id_map and v in id_map: 
                u_arr[i] = id_map[u]
                v_arr[i] = id_map[v]
                
        colors_arr = (ctypes.c_int * n)()
        
        # Call
        exec_time = lib.solve(n, m, u_arr, v_arr, colors_arr)
        
        # Return colors as list
        return list(colors_arr), exec_time
    except Exception as e:
        print(f"Error executing custom algo {algo_name}: {e}")
        raise e

def execute_custom_cpp_petri(algo_name, pnh_path):
    so_path = os.path.join(CUSTOM_ALGOS_DIR, f"{algo_name}.so")
    if not os.path.exists(so_path):
        raise FileNotFoundError(f"Custom algo {algo_name} not found at {so_path}")

    try:
        lib = ctypes.CDLL(so_path)
        # Try to access the function. This raises AttributeError if missing.
        solve_func = lib.solve_petri
        
        solve_func.argtypes = [ctypes.c_char_p]
        solve_func.restype = None

        # Convert to C string
        c_path = pnh_path.encode('utf-8')
        
        solve_func(c_path)
        
        return True
    except AttributeError:
        # Crucial for fallback logic
        raise AttributeError(f"Function 'solve_petri' not found in {algo_name}")
    except Exception as e:
        print(f"Error executing custom algo {algo_name} on Petri Net: {e}")
        raise e


class BenchmarkRunner:
    def __init__(self):
        pass

    def _aggregate_times(self, times, aggregation):
        if not times:
            return 0
        
        if aggregation == 'median':
            return statistics.median(times)
        elif aggregation == 'min':
            return min(times)
        elif aggregation == 'max':
            return max(times)
        elif aggregation == 'p95':
            s_times = sorted(times)
            idx = int(len(s_times) * 0.95)
            if idx >= len(s_times): idx = len(s_times) - 1
            return s_times[idx]
        else:
            return statistics.mean(times)

    def run_suite(self, algo_names, start_n, end_n, step_n, density, graph_count, iterations, aggregations=['mean'], dspn_options='', base_timeout=None):
        """
        Runs a benchmark suite.
        Returns a dict structure suitable for Chart.js, keyed by aggregation method.
        """
        results = {agg: {
            "labels": [],
            "datasets": []
        } for agg in aggregations}

        # Prepare datasets structure
        algo_data = {agg: {name: [] for name in algo_names} for agg in aggregations}
        
        # Determine N values
        n_values = list(range(start_n, end_n + 1, step_n))
        for agg in aggregations:
            results[agg]["labels"] = n_values

        print(f"[Bechmark] Starting suite: N={start_n}-{end_n}, dens={density}, graphs={graph_count}, iters={iterations}")

        for n in n_values:
            print(f"  > Testing N={n}...")
            # Generate ONE graph structure for this N to be fair? 
            # Or new random graph per iteration to average out topology effects?
            # Standard is: Average over X random executions.
            
            # Pre-calculate graphs for this batch to ensure all algos run on SAME data
            test_graphs = [generate_random_graph(n, density) for _ in range(graph_count)]

            for algo_name in algo_names:
                is_custom = False
                is_dspn = False
                func = None
                
                if algo_name == 'DSPN-Tool':
                    is_dspn = True
                elif algo_name in ALGORITHMS:
                    func = ALGORITHMS[algo_name]
                else:
                    # Check if custom
                    if os.path.exists(os.path.join(CUSTOM_ALGOS_DIR, f"{algo_name}.so")):
                        is_custom = True
                    else:
                        print(f"Skipping unknown algo: {algo_name}")
                        continue
                
                times = []

                for g_idx in range(graph_count):
                    nodes, edges = test_graphs[g_idx]
                    
                    for i in range(iterations):
                        # Execution Logic
                        if is_dspn:
                            if i == 0 and g_idx == 0:
                                for agg in aggregations:
                                    if "logs" not in results[agg]: results[agg]["logs"] = []
                                    results[agg]["logs"].append(f"[{algo_name}] Skipped: DSPN-Tool only supports Petri Nets, not Random Graphs.")
                            times.append(0)
                        elif is_custom:
                            with CaptureOutput() as capture:
                                result_colors, exec_time = execute_custom_cpp(algo_name, nodes, edges, is_directed=False)
                            
                            times.append(exec_time)
                            
                            if capture.output:
                                for agg in aggregations:
                                    if "logs" not in results[agg]: results[agg]["logs"] = []
                                    results[agg]["logs"].append(capture.output)
                            
                            # Log result info for the first iteration
                            if i == 0 and result_colors:
                                counts = {}
                                for c in result_colors:
                                    if c > 0: counts[c] = counts.get(c, 0) + 1
                                
                                unique_colors = sorted(counts.keys())
                                chrom_num = len(unique_colors)
                                dist_str = ", ".join([f"C{c}:{counts[c]}" for c in unique_colors])
                                for agg in aggregations:
                                    if "logs" not in results[agg]: results[agg]["logs"] = []
                                    results[agg]["logs"].append(f"[{algo_name}] Result (N={n}): Chromatic Number = {chrom_num} (Dist: {dist_str})")
                        else:
                            # Python Internal (from ALGORITHMS registry)
                            start_time = time.perf_counter() * 1000
                            with CaptureOutput() as capture:
                                func(nodes, edges)
                            end_time = time.perf_counter() * 1000
                            times.append(end_time - start_time)
                            
                            if capture.output:
                                for agg in aggregations:
                                    if "logs" not in results[agg]: results[agg]["logs"] = []
                                    results[agg]["logs"].append(capture.output)

                # Aggregate
                if times:
                    for agg in aggregations:
                        agg_time = self._aggregate_times(times, agg)
                        algo_data[agg][algo_name].append(round(agg_time, 4))
                else:
                    for agg in aggregations:
                        algo_data[agg][algo_name].append(0)

        # Build Final Structure
        colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
        for agg in aggregations:
            for i, (name, data) in enumerate(algo_data[agg].items()):
                color = colors[i % len(colors)]
                results[agg]["datasets"].append({
                    "label": name,
                    "data": data,
                    "borderColor": color,
                    "backgroundColor": color,
                    "fill": False
                })

        return results

    def run_specific(self, algo_names, graphs, iterations, aggregations=['mean'], dspn_options='', base_timeout=None):
        """
        Runs benchmark on specific graphs.
        graphs: list of dicts {'id': int, 'name': str, 'nodes': [], 'edges': []}
        """
        results = {agg: {
            "labels": [], # Graph Names
            "datasets": []
        } for agg in aggregations}

        # Use Graph Names as labels
        for agg in aggregations:
            results[agg]["labels"] = [g['name'] for g in graphs]
        
        print(f"[Bechmark] Starting specific suite: {len(graphs)} graphs, iters={iterations}")
        
        algo_data = {agg: {name: [] for name in algo_names} for agg in aggregations}

        for graph in graphs:
            nodes = graph['nodes']
            edges = graph['edges']
            name = graph['name']
            is_directed = graph.get('is_directed', False)
            print(f"  > Testing Graph: {name} (V={len(nodes)}, E={len(edges)}, Dir={is_directed})...")

            for algo_name in algo_names:
                is_custom = False
                is_dspn = False
                func = None
                
                if algo_name == 'DSPN-Tool':
                    is_dspn = True
                elif algo_name in ALGORITHMS:
                    func = ALGORITHMS[algo_name]
                else:
                    # Check if custom
                    if os.path.exists(os.path.join(CUSTOM_ALGOS_DIR, f"{algo_name}.so")):
                        is_custom = True
                    else:
                        print(f"Skipping unknown algo: {algo_name}")
                        for agg in aggregations:
                            algo_data[agg][algo_name].append(0)
                        continue

                times = []
                timed_out_in_iteration = False

                for i in range(iterations):
                    if timed_out_in_iteration:
                        break

                    # Execution Logic
                    if is_dspn:
                        success = False
                        exec_time = 0
                        if 'gspn_base' in graph:
                            try:
                                import subprocess
                                cmd = ["/usr/local/GreatSPN/bin/DSPN-Tool", "-load", graph['gspn_base']]
                                if dspn_options:
                                    cmd.extend(dspn_options.split())
                                if base_timeout:
                                    cmd.extend(["-timeout", str(base_timeout)])
                                
                                start_time = time.perf_counter() * 1000
                                try:
                                    process = subprocess.run(cmd, capture_output=True, text=True, timeout=base_timeout if base_timeout else None)
                                    end_time = time.perf_counter() * 1000
                                    exec_time = end_time - start_time
                                    success = True
                                    raw_name = graph.get('raw_name', graph['name'])
                                    output_text = f"--- [{raw_name}] DSPN-Tool Output ---\n{process.stdout}\n"
                                    if process.stderr:
                                        output_text += f"\n--- DSPN-Tool STDERR ---\n{process.stderr}\n"

                                    for agg in aggregations:
                                        if "logs" not in results[agg]: results[agg]["logs"] = []
                                        results[agg]["logs"].append(output_text)
                                        
                                except subprocess.TimeoutExpired as e:
                                    end_time = time.perf_counter() * 1000
                                    exec_time = end_time - start_time
                                    success = True
                                    timed_out_in_iteration = True
                                    raw_name = graph.get('raw_name', graph['name'])
                                    output_text = f"--- [{raw_name}] DSPN-Tool Output ---\n"
                                    output_text += f"TIMEOUT: Process killed by system after {base_timeout} seconds. Skipping remaining iterations.\n"
                                    if e.stdout:
                                        if isinstance(e.stdout, bytes):
                                            output_text += f"\nPartial Output:\n{e.stdout.decode('utf-8', errors='ignore')}\n"
                                        else:
                                            output_text += f"\nPartial Output:\n{e.stdout}\n"
                                    for agg in aggregations:
                                        if "logs" not in results[agg]: results[agg]["logs"] = []
                                        results[agg]["logs"].append(output_text)

                            except Exception as e:
                                print(f"  [Runner] DSPN-Tool Execution failed: {e}")
                                for agg in aggregations:
                                    if "logs" not in results[agg]: results[agg]["logs"] = []
                                    results[agg]["logs"].append(f"DSPN-Tool Error: {e}")
                        else:
                            print(f"  [Runner] DSPN-Tool skipped: No GSPN format available for {name}.")
                            for agg in aggregations:
                                if "logs" not in results[agg]: results[agg]["logs"] = []
                                results[agg]["logs"].append(f"DSPN-Tool skipped: No GSPN format available for {name}.")
                        
                        if success:
                            times.append(exec_time)
                            
                    elif is_custom:
                        success = False
                        result_colors = None
                        exec_time = 0
                        # Try PNH execution if path available
                        if 'pnh_path' in graph:
                            try:
                                with CaptureOutput() as capture:
                                    execute_custom_cpp_petri(algo_name, graph['pnh_path'])
                                success = True
                                # Measure externally? Or let custom reporter handle it
                                # (Left 0 for now as previously, usually reported via logs)
                            except AttributeError:
                                # Fallback to standard graph if Petri solver missing
                                with CaptureOutput() as capture:
                                    result_colors, exec_time = execute_custom_cpp(algo_name, nodes, edges, is_directed)
                                success = True
                            except Exception as e:
                                print(f"  [Runner] PNH Execution failed for {algo_name}: {e}")
                                with CaptureOutput() as capture:
                                    result_colors, exec_time = execute_custom_cpp(algo_name, nodes, edges, is_directed)
                                success = True
                        else:
                            with CaptureOutput() as capture:
                                result_colors, exec_time = execute_custom_cpp(algo_name, nodes, edges, is_directed)
                            success = True

                        if capture.output:
                            for agg in aggregations:
                                if "logs" not in results[agg]: results[agg]["logs"] = []
                                results[agg]["logs"].append(capture.output)

                        # Add result info
                        if success and result_colors and i == 0:
                            counts = {}
                            for c in result_colors:
                                if c > 0: counts[c] = counts.get(c, 0) + 1
                            
                            unique_colors = sorted(counts.keys())
                            chrom_num = len(unique_colors)
                            dist_str = ", ".join([f"C{c}:{counts[c]}" for c in unique_colors])
                            
                            for agg in aggregations:
                                if "logs" not in results[agg]: results[agg]["logs"] = []
                                results[agg]["logs"].append(f"[{algo_name}] Result ({graph['name']}): Chromatic Number = {chrom_num} (Dist: {dist_str})")

                        if success:
                            times.append(exec_time)
                    else:
                        # Python External Timer
                        start_time = time.perf_counter() * 1000 # ms
                        with CaptureOutput() as capture:
                            func(nodes, edges) # Output ignored
                        end_time = time.perf_counter() * 1000 # ms
                        times.append(end_time - start_time)
                        if capture.output:
                            for agg in aggregations:
                                if "logs" not in results[agg]: results[agg]["logs"] = []
                                results[agg]["logs"].append(capture.output)

                # Aggregate
                if times:
                    for agg in aggregations:
                        agg_time = self._aggregate_times(times, agg)
                        algo_data[agg][algo_name].append(round(agg_time, 4))
                else:
                    for agg in aggregations:
                        algo_data[agg][algo_name].append(0)

        # Build Final Structure
        colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
        for agg in aggregations:
            for i, (name, data) in enumerate(algo_data[agg].items()):
                color = colors[i % len(colors)]
                results[agg]["datasets"].append({
                    "label": name,
                    "data": data,
                    "borderColor": color,
                    "backgroundColor": color,
                    "fill": False
                })

        return results
