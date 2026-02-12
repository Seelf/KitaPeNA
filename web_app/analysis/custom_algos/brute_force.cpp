#include <algorithm>
#include <iostream>
#include <vector>

/**
 * Brute Force Graph Coloring
 * This is the "least optimal" approach:
 * it tries to color the graph using m colors starting from m=1,
 * and for each m it performs a full backtracking search.
 * Complexity: O(n * m^n) where m is current color count.
 */

// Adjacency list for easier neighboring checks
struct Graph {
  int n;
  std::vector<std::vector<int>> adj;
};

bool is_safe(int v, const Graph &G, int *colors, int c) {
  for (int neighbor : G.adj[v]) {
    if (colors[neighbor] == c) {
      return false;
    }
  }
  return true;
}

bool solve_rec(const Graph &G, int m, int *colors, int v) {
  // If all vertices are assigned a color, return true
  if (v == G.n)
    return true;

  // Try different colors for vertex v
  for (int c = 1; c <= m; c++) {
    if (is_safe(v, G, colors, c)) {
      colors[v] = c;

      // Recur to assign colors to the rest of the vertices
      if (solve_rec(G, m, colors, v + 1)) {
        return true;
      }

      // If assigning color c doesn't lead to a solution, remove it
      colors[v] = 0;
    }
  }

  return false;
}

extern "C" {
/**
 * Required interface:
 * n: node count
 * m: edge count
 * u, v: edge lists (0-indexed)
 * colors: output array (size n)
 */
void solve(int n, int m, int *u, int *v, int *colors) {
  // Build adjacency structure
  Graph G;
  G.n = n;
  G.adj.resize(n);
  for (int i = 0; i < m; i++) {
    G.adj[u[i]].push_back(v[i]);
    G.adj[v[i]].push_back(u[i]);
  }

  // Initialize all colors as 0
  for (int i = 0; i < n; i++)
    colors[i] = 0;

  // Try to find the chromatic number by testing m = 1, 2, ... n
  for (int max_colors = 1; max_colors <= n; max_colors++) {
    if (solve_rec(G, max_colors, colors, 0)) {
      // Success! Note: The UI/Benchmarking expects colors to be processed.
      // In runner.py, it counts unique colors.
      // We leave colors as 1..k as it finds k-coloring.
      return;
    }
    // Reset for next attempt
    for (int i = 0; i < n; i++)
      colors[i] = 0;
  }
}
}
