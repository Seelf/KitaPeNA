import time
import statistics
import os
import ctypes
from .generator import generate_random_graph
# Import algorithms
from ..coloring import get_optimal_coloring
from ..transitivity import check_transitive_orientability
from ..extensions.interface import CppAdapter

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

def execute_custom_cpp(algo_name, nodes, edges):
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
        lib.solve.restype = None

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
        lib.solve(n, m, u_arr, v_arr, colors_arr)
        
        # Return colors as list
        return list(colors_arr)
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

    def run_suite(self, algo_names, start_n, end_n, step_n, density, iterations):
        """
        Runs a benchmark suite.
        Returns a dict structure suitable for Chart.js.
        """
        results = {
            "labels": [], # X-axis: specific N values
            "datasets": [] # Data per algorithm
        }

        # Prepare datasets structure
        algo_data = {name: [] for name in algo_names}
        
        # Determine N values
        n_values = list(range(start_n, end_n + 1, step_n))
        results["labels"] = n_values

        print(f"[Bechmark] Starting suite: N={start_n}-{end_n}, dens={density}, iters={iterations}")

        for n in n_values:
            print(f"  > Testing N={n}...")
            # Generate ONE graph structure for this N to be fair? 
            # Or new random graph per iteration to average out topology effects?
            # Standard is: Average over X random executions.
            
            # Pre-calculate graphs for this batch to ensure all algos run on SAME data
            test_graphs = [generate_random_graph(n, density) for _ in range(iterations)]

            for algo_name in algo_names:
                is_custom = False
                func = None
                
                if algo_name in ALGORITHMS:
                    func = ALGORITHMS[algo_name]
                else:
                    # Check if custom
                    if os.path.exists(os.path.join(CUSTOM_ALGOS_DIR, f"{algo_name}.so")):
                        is_custom = True
                    else:
                        print(f"Skipping unknown algo: {algo_name}")
                        algo_data[algo_name].append(None)
                        continue
                
                times = []

                for i in range(iterations):
                    nodes, edges = test_graphs[i]
                    
                    # Execution Logic
                    if is_custom:
                        start_time = time.perf_counter() * 1000 # ms
                        with CaptureOutput() as capture:
                            result_colors = execute_custom_cpp(algo_name, nodes, edges)
                        
                        end_time = time.perf_counter() * 1000 # ms
                        times.append(end_time - start_time)

                        if capture.output:
                            if "logs" not in results: results["logs"] = []
                            results["logs"].append(capture.output)
                        
                        # Add result info for the first iteration of specific N
                        if i == 0 and result_colors:
                            counts = {}
                            for c in result_colors:
                                if c > 0: counts[c] = counts.get(c, 0) + 1
                            
                            unique_colors = sorted(counts.keys())
                            chrom_num = len(unique_colors)
                            dist_str = ", ".join([f"C{c}:{counts[c]}" for c in unique_colors])
                            
                            if "logs" not in results: results["logs"] = []
                            results["logs"].append(f"[{algo_name}] Result (N={n}): Chromatic Number = {chrom_num} (Dist: {dist_str})")
                    elif algo_name == 'cpp_solve':
                        # C++: Add artificial delay + Use Python Timer
                        start_time = time.perf_counter() * 1000 # ms
                        time.sleep(0.01) # 10ms artificial delay
                        with CaptureOutput() as capture:
                            func(nodes, edges) 
                        end_time = time.perf_counter() * 1000 # ms
                        times.append(end_time - start_time)
                        if capture.output:
                            if "logs" not in results: results["logs"] = []
                            results["logs"].append(capture.output)
                    else:
                        # Python External Timer
                        start_time = time.perf_counter() * 1000 # ms
                        with CaptureOutput() as capture:
                            func(nodes, edges) # Output ignored
                        end_time = time.perf_counter() * 1000 # ms
                        times.append(end_time - start_time)
                        if capture.output:
                            if "logs" not in results: results["logs"] = []
                            results["logs"].append(capture.output)

                # Average
                if times:
                    avg_time = statistics.mean(times)
                    algo_data[algo_name].append(round(avg_time, 4))
                else:
                    algo_data[algo_name].append(0)

        # Build Final Structure
        colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
        for i, (name, data) in enumerate(algo_data.items()):
            color = colors[i % len(colors)]
            results["datasets"].append({
                "label": name,
                "data": data,
                "borderColor": color,
                "backgroundColor": color,
                "fill": False
            })

        return results

    def run_specific(self, algo_names, graphs, iterations):
        """
        Runs benchmark on specific graphs.
        graphs: list of dicts {'id': int, 'name': str, 'nodes': [], 'edges': []}
        """
        results = {
            "labels": [], # Graph Names
            "datasets": []
        }

        # Use Graph Names as labels
        results["labels"] = [g['name'] for g in graphs]
        
        print(f"[Bechmark] Starting specific suite: {len(graphs)} graphs, iters={iterations}")
        
        algo_data = {name: [] for name in algo_names}

        for graph in graphs:
            nodes = graph['nodes']
            edges = graph['edges']
            name = graph['name']
            print(f"  > Testing Graph: {name} (V={len(nodes)}, E={len(edges)})...")

            for algo_name in algo_names:
                is_custom = False
                func = None
                
                if algo_name in ALGORITHMS:
                    func = ALGORITHMS[algo_name]
                else:
                     # Check if custom
                    if os.path.exists(os.path.join(CUSTOM_ALGOS_DIR, f"{algo_name}.so")):
                        is_custom = True
                    else:
                        print(f"Skipping unknown algo: {algo_name}")
                        algo_data[algo_name].append(None)
                        continue

                times = []

                for _ in range(iterations):
                    # Execution Logic
                    if is_custom:
                        start_time = time.perf_counter() * 1000 # ms
                        
                        success = False
                        result_colors = None
                        # Try PNH execution if path available
                        if 'pnh_path' in graph:
                            try:
                                with CaptureOutput() as capture:
                                    execute_custom_cpp_petri(algo_name, graph['pnh_path'])
                                success = True
                            except AttributeError:
                                # Fallback to standard graph if Petri solver missing
                                print(f"  [Runner] {algo_name} has no solve_petri. Falling back to graph solve.")
                                with CaptureOutput() as capture:
                                    result_colors = execute_custom_cpp(algo_name, nodes, edges)
                                success = True
                            except Exception as e:
                                print(f"  [Runner] PNH Execution failed for {algo_name}: {e}")
                                # Try fallback anyway? Or fail? Let's try fallback.
                                with CaptureOutput() as capture:
                                    result_colors = execute_custom_cpp(algo_name, nodes, edges)
                                success = True
                        else:
                            with CaptureOutput() as capture:
                                result_colors = execute_custom_cpp(algo_name, nodes, edges)
                            success = True
                            
                        end_time = time.perf_counter() * 1000 # ms
                        if capture.output:
                            if "logs" not in results: results["logs"] = []
                            results["logs"].append(capture.output)

                        # Add result info
                        if success and result_colors:
                            counts = {}
                            for c in result_colors:
                                if c > 0: counts[c] = counts.get(c, 0) + 1
                            
                            unique_colors = sorted(counts.keys())
                            chrom_num = len(unique_colors)
                            dist_str = ", ".join([f"C{c}:{counts[c]}" for c in unique_colors])
                            
                            if "logs" not in results: results["logs"] = []
                            results["logs"].append(f"[{algo_name}] Result ({graph['name']}): Chromatic Number = {chrom_num} (Dist: {dist_str})")

                        if success:
                            times.append(end_time - start_time)
                    elif algo_name == 'cpp_solve':
                        # C++: Add artificial delay + Use Python Timer
                        start_time = time.perf_counter() * 1000 # ms
                        time.sleep(0.01) # 10ms artificial delay
                        with CaptureOutput() as capture:
                            func(nodes, edges) 
                        end_time = time.perf_counter() * 1000 # ms
                        times.append(end_time - start_time)
                        if capture.output:
                            if "logs" not in results: results["logs"] = []
                            results["logs"].append(capture.output)
                    else:
                        # Python External Timer
                        start_time = time.perf_counter() * 1000 # ms
                        with CaptureOutput() as capture:
                            func(nodes, edges) # Output ignored
                        end_time = time.perf_counter() * 1000 # ms
                        times.append(end_time - start_time)
                        if capture.output:
                            if "logs" not in results: results["logs"] = []
                            results["logs"].append(capture.output)

                # Average
                if times:
                    avg_time = statistics.mean(times)
                    algo_data[algo_name].append(round(avg_time, 4))
                else:
                    algo_data[algo_name].append(0)

        # Build Final Structure
        colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
        for i, (name, data) in enumerate(algo_data.items()):
            color = colors[i % len(colors)]
            results["datasets"].append({
                "label": name,
                "data": data,
                "borderColor": color,
                "backgroundColor": color,
                "fill": False
            })

        return results
