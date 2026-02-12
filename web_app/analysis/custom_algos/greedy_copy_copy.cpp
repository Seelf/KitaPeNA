#include <vector>
#include <map>
#include <set>
#include <algorithm>

// Definicja pomocnicza (jeśli chcesz używać stylu obiektowego)
struct Graph {
    int n;
    std::vector<std::vector<int>> adj;
};

// Funkcja pomocnicza (Twoja logika)
std::map<int, int> greedy_coloring(const Graph &G) {
  std::map<int, int> result;
  std::vector<int> colors(G.n, -1);

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

extern "C" {
    // WYMAGANY INTERFEJS WEJŚCIOWY
    void solve(int n, int m, int* u, int* v, int* colors) {
        // 1. Budujemy strukturę Graph z surowych danych
        Graph G;
        G.n = n;
        G.adj.resize(n);
        for(int i=0; i<m; ++i) {
            G.adj[u[i]].push_back(v[i]);
            G.adj[v[i]].push_back(u[i]);
        }

        // 2. Wywołujemy Twoją funkcję
        std::map<int, int> res = greedy_coloring(G);

        // 3. Przepisujemy wynik do tablicy wyjściowej
        for(auto const& [node, color] : res) {
            colors[node] = color;
        }
    }
}