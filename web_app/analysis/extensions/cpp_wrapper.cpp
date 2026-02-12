#include <algorithm>
#include <chrono>
#include <map>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <set>
#include <vector>

namespace py = pybind11;

// --- ACTUAL C++ ALGORITHM (Greedy Coloring) ---
// This is the "Injected" logic user asked for.
// It works on pure C++ types (std::vector, int).

struct Graph {
  int n;
  std::vector<std::vector<int>> adj;

  Graph(int nodes) : n(nodes) { adj.resize(n); }

  void add_edge(int u, int v) {
    if (u >= 0 && u < n && v >= 0 && v < n) {
      adj[u].push_back(v);
      adj[v].push_back(u);
    }
  }
};

std::map<int, int> greedy_coloring(const Graph &G) {
  std::map<int, int> result;
  std::vector<int> colors(G.n, -1);

  // Simple First Fit (for comparison or fallback)
  for (int u = 0; u < G.n; u++) {
    std::set<int> neighbor_colors;
    for (int v : G.adj[u]) {
      if (colors[v] != -1) {
        neighbor_colors.insert(colors[v]);
      }
    }
    int color = 1;
    while (neighbor_colors.count(color))
      color++;
    colors[u] = color;
    result[u] = color;
  }
  return result;
}

// DSatur Heuristic
std::map<int, int> dsatur_coloring(const Graph &G) {
  std::map<int, int> result;
  std::vector<int> colors(G.n, -1);
  std::vector<std::set<int>> saturation(G.n);
  std::vector<int> degrees(G.n, 0);
  int uncolored_count = G.n;

  // Calculate generic degrees
  for (int i = 0; i < G.n; ++i) {
    degrees[i] = G.adj[i].size();
  }

  while (uncolored_count > 0) {
    // 1. Selection: Max saturation, then Max degree
    int best_u = -1;
    int max_sat = -1;
    int max_deg = -1;

    for (int i = 0; i < G.n; ++i) {
      if (colors[i] == -1) {
        int sat = saturation[i].size();
        int deg = degrees[i]; // strict degree in original graph (or subgraph?)
                              // - original is fine for DSatur tie-break

        if (sat > max_sat) {
          max_sat = sat;
          max_deg = deg;
          best_u = i;
        } else if (sat == max_sat) {
          if (deg > max_deg) {
            max_deg = deg;
            best_u = i;
          }
        }
      }
    }

    if (best_u == -1)
      break; // Should not happen

    // 2. Coloring: Smallest available
    std::set<int> neighbor_colors;
    for (int v : G.adj[best_u]) {
      if (colors[v] != -1) {
        neighbor_colors.insert(colors[v]);
      }
    }
    int color = 1;
    while (neighbor_colors.count(color))
      color++;

    colors[best_u] = color;
    result[best_u] = color;
    uncolored_count--;

    // 3. Update Saturation of neighbors
    for (int v : G.adj[best_u]) {
      if (colors[v] == -1) {
        saturation[v].insert(color);
      }
    }
  }

  return result;
}

// --- WRAPPER ---

// Improved solve capable of taking standard Python types directly
py::dict solve_common(py::list nodes, py::list edges, bool use_dsatur) {
  auto start = std::chrono::high_resolution_clock::now();

  // 1. Convert Python Objects -> C++ Graph
  int n = py::len(nodes);
  Graph G(n);

  // Mapping ID -> Index (if IDs are not 0..N-1)
  std::map<int, int> id_to_idx;
  int idx = 0;
  for (auto node : nodes) {
    // node is dict
    int id = node["id"].cast<int>();
    id_to_idx[id] = idx++;
  }

  for (auto item : edges) {
    // edge is [u, v]
    py::sequence edge = item.cast<py::sequence>();
    int u_id = edge[0].cast<int>();
    int v_id = edge[1].cast<int>();

    if (id_to_idx.count(u_id) && id_to_idx.count(v_id)) {
      G.add_edge(id_to_idx[u_id], id_to_idx[v_id]);
    }
  }

  // 2. Algorithm
  std::map<int, int> coloring;
  if (use_dsatur) {
    coloring = dsatur_coloring(G);
  } else {
    coloring = greedy_coloring(G);
  }

  // 3. Return
  auto end = std::chrono::high_resolution_clock::now();
  double duration_ms =
      std::chrono::duration<double, std::milli>(end - start).count();

  py::dict response;
  response["success"] = true;
  response["coloring"] = coloring;
  response["execution_time_ms"] = duration_ms;

  // Calculate chromatic number
  int max_c = 0;
  for (auto const &kv : coloring) {
    if (kv.second > max_c)
      max_c = kv.second;
  }
  response["chromatic_number"] = max_c;

  return response;
}

py::dict solve_greedy(py::list nodes, py::list edges) {
  return solve_common(nodes, edges, false);
}

py::dict solve_dsatur(py::list nodes, py::list edges) {
  return solve_common(nodes, edges, true);
}

PYBIND11_MODULE(mis_cpp, m) {
  m.doc() = "C++ Backend for MIS Algorithms using Pybind11";
  m.def("solve", &solve_greedy, "Solve MIS problem (Greedy FirstFit)",
        py::arg("nodes"), py::arg("edges"));
  m.def("solve_dsatur", &solve_dsatur, "Solve MIS problem (DSatur)",
        py::arg("nodes"), py::arg("edges"));
}
