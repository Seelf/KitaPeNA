import networkx as nx
import collections

def check_transitive_orientability(nodes, edges):
    """
    Checks if the graph is transitively orientable (Comparability Graph).
    Returns dict with result and orientation/message.
    """
    if not nodes:
        return {
            'isOrientable': True,
            'message': 'Empty graph is trivially transitively orientable.'
        }

    # Build NetworkX Graph
    G = nx.Graph()
    for n in nodes:
        G.add_node(n['id'])
    for e in edges:
        # e is [u, v] or [u, v, attr]
        G.add_edge(e[0], e[1])

    # A graph is a comparability graph if and only if it is a transitive orientation
    # Common algorithm: Calculate Modular Decomposition or verify disjointness of other structures.
    # Simpler approach matching JS logic: Attempt to build an orientation using implication classes (Gilmore-Hoffman theorem related).
    
    # However, NetworkX likely has this or we can implement the O(n+m) algorithm?
    # NetworkX doesn't have checks.is_comparability_graph built-in directly in older versions?
    # Let's check available algorithms or implement the JS logic but robustly.
    
    # Algorithm:
    # 1. Compute G_delta (implication graph) or just try to orient edges.
    #    For each edge xy, we have constraints. 
    #    If x-y and y-z are edges but x-z is NOT (P3), then orientation must be x->y => y->z is FORBIDDEN (must be z->y)
    #    Actually: x->y and y->z ==> x->z. If x-z missing, then x->y IMPLIES z->y (or y->z IMPLIES y->x).
    #    Gamma classes.
    
    # We will implement the logic from the JS:
    # For every edge, if unoriented, pick direction, propagate constraints. 
    # If contradiction, then NOT TO.
    
    orientation = {} # (u, v) -> 1 (u->v)
    
    def get_orientation(u, v):
        if (u, v) in orientation: return 1
        if (v, u) in orientation: return -1
        return 0

    def set_orientation(u, v):
        # We want u -> v
        if (v, u) in orientation: return False # Contradiction
        orientation[(u, v)] = 1
        return True

    # Adjacency set for fast lookup
    adj = {n: set(G.neighbors(n)) for n in G.nodes()}
    
    # List of edges to process
    edge_list = list(G.edges())
    
    contradiction = False
    contradiction_msg = ""
    
    # Process connected components of the "implication graph"
    # We iterate edges. If an edge is not oriented, start BFS/propagation on it.
    
    processed_edges = set()
    
    for u, v in edge_list:
        if (u, v) in orientation or (v, u) in orientation:
            continue
            
        # Start orienting u->v
        queue = collections.deque([(u, v)])
        
        # We need to backtrack? No, if it's a comparability graph, 
        # the choice of direction for the first edge of a component dictates the rest (or its reverse).
        # We only fail if there's a contradiction within the component.
        
        # Temp orientation for this component to allow rollback? 
        # Actually logic says: if G is TO, then for any edge class, either orientation works OR it's forced by another class.
        # But here classes are independent or constrained.
        
        while queue:
            x, y = queue.popleft()
            
            if get_orientation(x, y) == -1:
                contradiction = True
                contradiction_msg = f"Contradiction at edge {x}-{y}"
                break
                
            if get_orientation(x, y) == 1:
                continue # Already done
            
            if not set_orientation(x, y):
                contradiction = True
                break
                
            # Propagate constraints (Triangle propagation)
            # If x->y, and we have z s.t. x-z and z-y are edges? (Triangle)
            #   If x->y, y->z => x->z must exist.
            #   If x->y, z->x => z->y must exist.
            
            # Implication class logic (P3):
            # If x-y and y-z are edges, but x-z is NOT:
            # x->y IMPLIES z->y. (Because if y->z, then x->z would be required).
            
            # Find neighbors of x and y
            nx_neighbors = adj[x]
            ny_neighbors = adj[y]
            
            # 1. Check P3s involving x-y
            # Neighbors of y that are NOT neighbors of x (excluding x itself)
            for z in ny_neighbors:
                if z == x: continue
                if z not in nx_neighbors:
                    # x-y-z exists, x-z does NOT.
                    # x->y IMPLIES z->y
                    # Check if z->y is consistent
                    if get_orientation(z, y) == -1: # y->z
                         contradiction = True
                         contradiction_msg = f"P3 Contradiction: {x}->{y} implies {z}->{y}, but {y}->{z} exists"
                         break
                    if get_orientation(z, y) == 0:
                         queue.append((z, y))
            
            if contradiction: break
            
            # Neighbors of x that are NOT neighbors of y
            for w in nx_neighbors:
                if w == y: continue
                if w not in ny_neighbors:
                    # w-x-y exists, w-y does NOT.
                    # x->y IMPLIES x->w
                    if get_orientation(x, w) == -1: # w->x
                        contradiction = True
                        contradiction_msg = f"P3 Contradiction: {x}->{y} implies {x}->{w}, but {w}->{x} exists"
                        break
                    if get_orientation(x, w) == 0:
                        queue.append((x, w))
                        
            if contradiction: break
            
            # 2. Transitivity Checks (Triangles)
            # if x->y and y->z, MUST have x->z
            # This is hard to propagate efficiently without looking at all triangles.
            # But simpler: we just ensured P3s are handled. 
            # If P3s are handled, we have a Local Transitive Orientation?
            # We need to ensure that the orientation is transitive closing.
            
        if contradiction: break

    if contradiction:
        return {
            'isOrientable': False,
            'message': f"Graph is NOT transitively orientable. {contradiction_msg}"
        }

    # Final check for transitivity on the generated orientation
    # (The P3 propagation ensures 2-chordal orientation, but we check transitivity explicitly to be safe)
    # Check every x->y->z, ensure x->z
    
    # Extract directed edges
    directed_edges = [ (u, v) for (u, v) in orientation ]
    DG = nx.DiGraph()
    DG.add_nodes_from(G.nodes())
    DG.add_edges_from(directed_edges)
    
    # Check transitivity: for every u->v and v->w, is u->w?
    # Only need to check for small graphs usually, but let's do it
    # Iterate all u
    is_transitive = True
    for u in G.nodes():
        for v in DG.successors(u):
            for w in DG.successors(v):
                if not DG.has_edge(u, w):
                    is_transitive = False
                    contradiction_msg = f"Transitivity violation: {u}->{v}->{w} but missing {u}->{w}"
                    break
            if not is_transitive: break
        if not is_transitive: break
            
    if not is_transitive:
         return {
            'isOrientable': False,
            'message': f"Graph is NOT transitively orientable. {contradiction_msg}"
        }

    return {
        'isOrientable': True,
        'message': f"Graph IS transitively orientable. Orientation with {len(orientation)} arcs found."
    }
