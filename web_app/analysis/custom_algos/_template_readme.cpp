#include <iostream>
#include <vector>

/**
 * KITAPENA - C++ ALGORITHM TEMPLATE & DOCUMENTATION
 * ------------------------------------------------
 *
 * To write a custom algorithm that integrates with the benchmarking engine,
 * you need to implement at least one of the two core functions described below.
 *
 * The system automatically wraps your code with a timer and exports it
 * to a shared library (.so) for high-performance execution.
 */

/*
 * OPTION 1: Standard Graph Solver
 * This function is called for generic graphs (MIS) or reachability graphs.
 *
 * Parameters:
 * - n:          Number of vertices (nodes are indexed 0 to n-1).
 * - m:          Number of edges.
 * - u:          Array of source vertex indices for each edge.
 * - v:          Array of target vertex indices for each edge.
 * - colors_out: Array where you should store the result (e.g., color ID for
 * each node). Memory for colors_out [size n] is pre-allocated by the
 * orchestrator.
 */
void solve(int n, int m, int *u, int *v, int *colors_out) {
  // TIP: The orchestrator captures everything you print to stdout/stderr!
  std::cout << "[MyAlgo] Starting execution on " << n << " nodes..."
            << std::endl;

  // 1. Initialize result
  for (int i = 0; i < n; i++) {
    colors_out[i] = 0; // 0 usually means "uncolored" or "default"
  }

  // 2. Simple Example: Basic Greedy (just for demonstration)
  // We can build an adjacency list for easier processing:
  std::vector<std::vector<int>> adj(n);
  for (int i = 0; i < m; i++) {
    adj[u[i]].push_back(v[i]);
    adj[v[i]].push_back(u[i]); // Undirected assumption for MIS
  }

  // Assign a "color" ID to each node
  for (int i = 0; i < n; i++) {
    colors_out[i] = (i % 5) + 1; // Example: cyclical coloring 1-5
  }

  std::cout << "[MyAlgo] Done. Used 5 pseudo-colors." << std::endl;
}

/*
 * OPTION 2: Petri Net (PNH) Deep Solver (Optional)
 * This is called if you select "PNH File" mode in benchmarking.
 * It allows you to parse the Petri net directly from the file system.
 *
 * Parameters:
 * - pnh_path: Absolute path to the .pnh file.
 */
void solve_petri(const char *pnh_path) {
  std::cout << "[MyAlgo] Analyzing Petri net from: " << pnh_path << std::endl;

  // Here you would typically use your own PNH parser
  // and run state-space exploration or reachability analysis.

  // Example output (will appear in the console):
  std::cout << "Successfully parsed PNH. Found X places and Y transitions."
            << std::endl;
}

/**
 * BEST PRACTICES:
 * 1. Use std::cout for logging (it will appear in the web console).
 * 2. Avoid heavy global state if you plan to run many iterations.
 * 3. The 'solve' function is the most universal one.
 * 4. Your function MUST be named exactly 'solve' or 'solve_petri' (lowercase).
 */
