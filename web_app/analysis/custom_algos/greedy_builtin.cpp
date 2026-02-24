#include <set>
#include <vector>

/**
 * Basic Greedy Coloring algorithm.
 * Part of the "built-in" suite moved to Custom Algos.
 */
void solve(int n, int m, int *u, int *v, int *colors_out) {
  std::vector<std::vector<int>> adj(n);
  for (int i = 0; i < m; i++) {
    if (u[i] >= 0 && u[i] < n && v[i] >= 0 && v[i] < n) {
      adj[u[i]].push_back(v[i]);
      adj[v[i]].push_back(u[i]);
    }
  }

  std::vector<int> colors(n, -1);
  for (int i = 0; i < n; i++) {
    std::set<int> neighbor_colors;
    for (int neighbor : adj[i]) {
      if (colors[neighbor] != -1) {
        neighbor_colors.insert(colors[neighbor]);
      }
    }
    int color = 1;
    while (neighbor_colors.count(color))
      color++;
    colors[i] = color;
    colors_out[i] = color;
  }
}
