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

    # Build Graph
    G = nx.Graph()
    for n in nodes:
        G.add_node(n['id'])
    for e in edges:
        G.add_edge(e[0], e[1])

    # Algorithm: Attempt to build an orientation using implication classes.
    # If x-y and y-z are edges but x-z is NOT (P3), then:
    # x->y IMPLIES z->y (and symmetric).
    
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

    # Adjacency lookup
    adj = {n: set(G.neighbors(n)) for n in G.nodes()}
    edge_list = list(G.edges())
    
    contradiction = False
    contradiction_msg = ""
    
    # Process edges
    for u, v in edge_list:
        if (u, v) in orientation or (v, u) in orientation:
            continue
            
        # Start orienting u->v
        queue = collections.deque([(u, v)])
        
        while queue:
            x, y = queue.popleft()
            
            if get_orientation(x, y) == -1:
                contradiction = True
                contradiction_msg = f"Contradiction at edge {x}-{y}"
                break
                
            if get_orientation(x, y) == 1:
                continue 
            
            if not set_orientation(x, y):
                contradiction = True
                break
                
            # Propagate constraints (P3 Implication)
            nx_neighbors = adj[x]
            ny_neighbors = adj[y]
            
            # 1. Check P3s involving x-y
            # Neighbors of y not neighbors of x
            for z in ny_neighbors:
                if z == x: continue
                if z not in nx_neighbors:
                    # x-y-z exists, x-z does NOT. x->y IMPLIES z->y
                    if get_orientation(z, y) == -1: # y->z
                         contradiction = True
                         contradiction_msg = f"P3 Contradiction: {x}->{y} implies {z}->{y}, but {y}->{z} exists"
                         break
                    if get_orientation(z, y) == 0:
                         queue.append((z, y))
            
            if contradiction: break
            
            # Neighbors of x not neighbors of y
            for w in nx_neighbors:
                if w == y: continue
                if w not in ny_neighbors:
                    # w-x-y exists, w-y does NOT. x->y IMPLIES x->w
                    if get_orientation(x, w) == -1: # w->x
                        contradiction = True
                        contradiction_msg = f"P3 Contradiction: {x}->{y} implies {x}->{w}, but {w}->{x} exists"
                        break
                    if get_orientation(x, w) == 0:
                        queue.append((x, w))
                        
            if contradiction: break
            
        if contradiction: break

    if contradiction:
        return {
            'isOrientable': False,
            'message': f"Graph is NOT transitively orientable. {contradiction_msg}"
        }

    # Final Transitivity Check
    directed_edges = [ (u, v) for (u, v) in orientation ]
    DG = nx.DiGraph()
    DG.add_nodes_from(G.nodes())
    DG.add_edges_from(directed_edges)
    
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
