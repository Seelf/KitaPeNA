// C++ Graph Coloring Algorithm Interface
// extern "C" void solve(int n, int m, int* u, int* v, int* colors)

#include <vector>
#include <algorithm>

extern "C" {

void solve(int n, int m, int* u, int* v, int* colors) {
    std::vector<std::vector<int>> adj(n);
    for(int i=0; i<m; ++i) {
        adj[u[i]].push_back(v[i]);
        adj[v[i]].push_back(u[i]);
    }

    for(int i=0; i<n; ++i) {
        std::vector<bool> used(n + 1, false);
        for(int neighbor : adj[i]) {
            if(colors[neighbor] != 0) used[colors[neighbor]] = true;
        }
        
        int c = 1; 
        while(used[c]) c++;
        colors[i] = c;
    }
}

}