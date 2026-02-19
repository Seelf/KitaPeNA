import collections
from . import reachability as petri_reachability

def build_concurrency_graph(places, transitions, arcs, max_states=1000):
    """
    Builds the Concurrency Graph (Place Concurrency Relation).
    Two places are concurrent if they can both hold tokens simultaneously in a reachable marking.
    """
    
    # 0. Setup
    sorted_places = sorted(places, key=lambda p: p['id'])
    place_id_to_idx = {p['id']: i for i, p in enumerate(sorted_places)}
    n_places = len(sorted_places)
    
    # 1. Generate Reachability Graph
    reachability_nodes, _, _ = petri_reachability.calculate_reachability_graph(
        places, transitions, arcs, max_states=max_states
    )
    
    print(f"DEBUG: Reachability graph states: {len(reachability_nodes)}")
    
    # 2. Build Concurrency Set
    concurrent_pairs = [[False for _ in range(n_places)] for _ in range(n_places)]
    
    for node in reachability_nodes:
        marking = node.get('marking', {})
        
        # Find active places in this marking
        active_indices = []
        for pid, tokens in marking.items():
            if tokens > 0 and pid in place_id_to_idx:
                active_indices.append(place_id_to_idx[pid])
        
        # Mark pairs as concurrent
        for i in range(len(active_indices)):
            for j in range(i + 1, len(active_indices)):
                idx_i, idx_j = active_indices[i], active_indices[j]
                concurrent_pairs[idx_i][idx_j] = True
                concurrent_pairs[idx_j][idx_i] = True
    
    # 3. Build Graph
    graph_nodes = [{
        'id': p['id'],
        'label': p.get('label', f'p{p["id"]}'),
        'x': p.get('x', 0),
        'y': p.get('y', 0)
    } for p in sorted_places]
    
    graph_edges = []
    for i in range(n_places):
        for j in range(i + 1, n_places):
            if concurrent_pairs[i][j]:
                graph_edges.append([sorted_places[i]['id'], sorted_places[j]['id']])
    
    print(f"DEBUG: Concurrent edges: {len(graph_edges)}")
    
    return graph_nodes, graph_edges
