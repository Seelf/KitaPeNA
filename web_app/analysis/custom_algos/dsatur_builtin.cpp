#include <algorithm>
#include <set>
#include <vector>

/**
 * DSatur (Degree of Saturation) Heuristic.
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
  std::vector<std::set<int>> saturation(n);
  std::vector<int> degrees(n, 0);
  for (int i = 0; i < n; i++)
    degrees[i] = adj[i].size();

  int uncolored = n;
  while (uncolored > 0) {
    int best_u = -1;
    int max_sat = -1;
    int max_deg = -1;

    for (int i = 0; i < n; i++) {
      if (colors[i] == -1) {
        int sat = saturation[i].size();
        int deg = degrees[i];
        if (sat > max_sat || (sat == max_sat && deg > max_deg)) {
          max_sat = sat;
          max_deg = deg;
          best_u = i;
        }
      }
    }

    if (best_u == -1)
      break;

    std::set<int> neighbor_colors;
    for (int neighbor : adj[best_u]) {
      if (colors[neighbor] != -1)
        neighbor_colors.insert(colors[neighbor]);
    }

    int color = 1;
    while (neighbor_colors.count(color))
      color++;
    colors[best_u] = color;
    colors_out[best_u] = color;
    uncolored--;

    for (int neighbor : adj[best_u]) {
      if (colors[neighbor] == -1)
        saturation[neighbor].insert(color);
    }
  }
}
