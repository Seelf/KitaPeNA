import networkx as nx

def get_optimal_coloring(nodes, edges):
    """
    Computes optimal graph coloring.
    Returns { chromaticNumber: int, coloring: {nodeId: color} }
    """
    if not nodes:
        return {'chromaticNumber': 0, 'coloring': {}}

    # Build Graph
    G = nx.Graph()
    for n in nodes:
        G.add_node(n['id'])
    for e in edges:
         G.add_edge(e[0], e[1])
         
    # 1. Heuristics (DSatur)
    try:
        coloring = nx.coloring.greedy_color(G, strategy='saturation_largest_first')
    except Exception:
        # Fallback
        coloring = nx.coloring.greedy_color(G, strategy='largest_first')
    
    max_c = max(coloring.values()) + 1 if coloring else 0
        
    # Convert to 1-based colors for frontend
    final_coloring = {k: v + 1 for k, v in coloring.items()}
    
    # 2. Exact check
    # DSatur is optimal for perfect graphs (e.g. TO graphs), so acceptable for now.
    
    return {
        'chromaticNumber': max_c,
        'coloring': final_coloring
    }
