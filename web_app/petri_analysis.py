
import collections

def calculate_incidence_matrix(places, transitions, arcs):
    """
    Constructs the incidence matrix C where C[p][t] = W(t->p) - W(p->t).
    Returns:
        matrix: Dict of Dicts {place_id: {trans_id: value}}
        place_ids: Sorted list of place IDs
        trans_ids: Sorted list of transition IDs
    """
    place_ids = sorted([p['id'] for p in places])
    trans_ids = sorted([t['id'] for t in transitions])
    
    # Init matrix
    matrix = {pid: {tid: 0 for tid in trans_ids} for pid in place_ids}
    
    for arc in arcs:
        weight = arc.get('weight', 1)
        if arc['type'] == 'place_to_transition':
            # p -> t (Consumer, negative)
            pid = arc['sourceId']
            tid = arc['targetId']
            if pid in matrix and tid in matrix[pid]:
                matrix[pid][tid] -= weight
        elif arc['type'] == 'transition_to_place':
            # t -> p (Producer, positive)
            tid = arc['sourceId']
            pid = arc['targetId']
            if pid in matrix and tid in matrix[pid]:
                matrix[pid][tid] += weight
                
    return matrix, place_ids, trans_ids

def find_p_invariants(matrix, place_ids, trans_ids):
    """
    Finds P-Invariants (x^T * C = 0) using a basic elimination algorithm suitable for small nets.
    Ideally, this should use a proper linear algebra solver or algorithm like Farkas' Lemma for minimal semi-positive invariants.
    For this implementation, we will use a simplified Gaussian-like elimination to find a basis and then combination.
    
    NOTE: This is a simplified implementation. For complex nets, a robust library is recommended.
    """
    # Convert dict matrix to list of lists (rows = places, cols = transitions)
    # But for P-invariants we solve x^T * C = 0, which is C^T * x = 0.
    # So we want rows = transitions, cols = places for standard Ax=0.
    
    nrows = len(trans_ids)
    ncols = len(place_ids)
    
    if nrows == 0 or ncols == 0:
        return []
        
    # Build C^T (cols=places, rows=transitions)
    # A[tr_idx][pl_idx]
    A = []
    for tid in trans_ids:
        row = []
        for pid in place_ids:
            row.append(matrix[pid][tid])
        A.append(row)
        
    # We need to find non-negative integer solutions to A*x = 0.
    # This is a hard problem (Diophantine). 
    # For this specific "Concurrency Relation" structural algorithm, often just finding 1-invariants (sum tokens = 1) is enough.
    # Let's try to find simple invariants by iterating or using a heuristics.
    
    # 1. Fourier-Motzkin elimination or Martinez-Silva algorithm is standard for Petri Nets.
    # Let's implement a very basic Martinez-Silva algorithm for P-Invariants.
    
    # Identity matrix (size = places)
    I = []
    for i in range(ncols):
        row = [0] * ncols
        row[i] = 1
        I.append(row)
        
    # Current matrix D = [I | C^T'] where C^T' are columns of C mapped to rows here?
    # Martinez-Silva operates on [I | C]. Rows correspond to Places initially.
    # D[i] = [vector_representation | incidence_row]
    
    # Re-build matrix in [Place_Vector | Transition_Effects] format
    # Rows are places.
    D = []
    for i, pid in enumerate(place_ids):
        # Identity part (vector representation of this place)
        vec = [0] * ncols
        vec[i] = 1
        
        # Incidence part (effect of transitions on this place)
        # C[p][.]
        inc = []
        for tid in trans_ids:
            inc.append(matrix[pid][tid])
            
        D.append({'vec': vec, 'inc': inc})
        
    # Algorithm:
    # For each transition column j:
    #   Classify rows into P (positive), N (negative), Z (zero) at column j.
    #   New set of rows D' = Z
    #   For each p in P and n in N:
    #      Combine p and n to cancel out value at column j.
    #      new_row = n.val * p + p.val * n (simple linear comb to make 0)
    #      Check if new_row support is minimal (optional optimization)
    #      Add to D'
    #   D = D'
    
    for j in range(nrows): # For each transition
        P_set = []
        N_set = []
        Z_set = []
        
        for row in D:
            val = row['inc'][j]
            if val > 0:
                P_set.append(row)
            elif val < 0:
                N_set.append(row)
            else:
                Z_set.append(row)
                
        next_D = list(Z_set)
        
        for p_row in P_set:
            for n_row in N_set:
                p_val = p_row['inc'][j]
                n_val = -n_row['inc'][j] # Make positive
                
                # Combine: n_val * P + p_val * N
                # To minimize, we can divide by GCD, but let's stick to basics
                
                # New vector (invariant candidate)
                new_vec = [
                    n_val * p_row['vec'][k] + p_val * n_row['vec'][k]
                    for k in range(ncols)
                ]
                
                # New incidence (remaining transitions)
                new_inc = [
                    n_val * p_row['inc'][k] + p_val * n_row['inc'][k]
                    for k in range(nrows)
                ]
                
                # Helper: GCD simplified?
                # For basic correctness standard integer check
                
                next_D.append({'vec': new_vec, 'inc': new_inc})
                
        D = next_D
        
    # Results are rows where inc part is all zero (which should be all by definition if consistent)
    # Filter for semi-positive (non-zero, non-negative)
    invariants = []
    for row in D:
        vec = row['vec']
        # Check if all 0 (incidence)
        if any(x != 0 for x in row['inc']):
            continue # Should not happen if elimination is complete
            
        # Check signs
        if any(x < 0 for x in vec):
             continue
        if all(x == 0 for x in vec):
             continue
             
        # Normalize? Divide by GCD of elements
        # TODO: GCD normalization
        
        invariants.append(vec)
        
    return invariants

def check_unit_sum(invariant, places, initial_marking):
    """
    Checks if Sum(M0(p) * inv(p)) == 1.
    invariant: List of coeffs matching 'places' order.
    places: List of dicts.
    initial_marking: Dict {place_id: count}
    """
    total = 0
    # Both updated 'places' (with tokens) and 'initial_marking' could be sources.
    # We'll use the passed places/marking.
    
    # Sort places to match invariant order
    sorted_places = sorted(places, key=lambda p: p['id'])
    
    for i, coeff in enumerate(invariant):
        if coeff > 0:
             pid = sorted_places[i]['id']
             tokens = initial_marking.get(pid, 0)
             total += coeff * tokens
             
    return total == 1

def build_concurrency_graph(places, transitions, arcs):
    """
    Main function to compute concurrency graph.
    """
    # 0. Setup
    sorted_places = sorted(places, key=lambda p: p['id'])
    place_id_map = {p['id']: i for i, p in enumerate(sorted_places)} # ID -> Index 0..N-1
    n_places = len(sorted_places)
    
    initial_marking = {p['id']: p.get('tokens', 0) for p in places}
    
    # 1. Incidence Matrix
    matrix, p_ids, t_ids = calculate_incidence_matrix(places, transitions, arcs)
    
    # 2. P-Invariants
    invariants = find_p_invariants(matrix, p_ids, t_ids)
    
    # 3. Exclusion Matrix (False = Concurrency allowed, True = Conflict/Exclusion)
    # Init False (Optimistic concurrency)
    exclusion = [[False for _ in range(n_places)] for _ in range(n_places)]
    
    print(f"DEBUG: Found {len(invariants)} invariants.")
    
    # 3a. Invariant Exclusion
    # For each invariant I with Sum(M0) == 1:
    # All places in support of I are mutually exclusive.
    for idx, inv in enumerate(invariants):
        is_unit = check_unit_sum(inv, places, initial_marking)
        # print(f"DEBUG: Inv {idx}: {inv}, UnitSum={is_unit}")
        if is_unit:
            # Get support indices
            support_indices = [i for i, x in enumerate(inv) if x > 0]
            
            # Mark all pairs
            for i in support_indices:
                for j in support_indices:
                    if i != j:
                        exclusion[i][j] = True
                        exclusion[j][i] = True
                        
    # 3b. Structural Conflict (Transition Inputs)
    conflict_count = 0
    for t in transitions:
        # Find inputs
        inputs = []
        for arc in arcs:
            if arc['type'] == 'place_to_transition' and arc['targetId'] == t['id']:
                pid = arc['sourceId']
                if pid in place_id_map:
                    inputs.append(place_id_map[pid])
        
        # All pairs in inputs exclude each other
        for i in inputs:
            for j in inputs:
                if i != j:
                    if not exclusion[i][j]:
                        conflict_count += 1
                    exclusion[i][j] = True
                    exclusion[j][i] = True
    print(f"DEBUG: Added {conflict_count} structural conflicts.")

    # 4. Transitive Closure (Floyd-Warshall)
    for k in range(n_places):
        for i in range(n_places):
            for j in range(n_places):
                if exclusion[i][k] and exclusion[k][j]:
                    exclusion[i][j] = True
                    
    # 5. Build Graph
    # Nodes: Places
    # Edges: Non-exclusive pairs (Concurrency)
    
    graph_nodes = []
    for i, p in enumerate(sorted_places):
        graph_nodes.append({
            'id': p['id'],
            'label': p.get('label', f'p{p["id"]}'),
            'x': p.get('x', 0),
            'y': p.get('y', 0)
        })
        
    graph_edges = []
    for i in range(n_places):
        for j in range(i + 1, n_places): # Undirected, check once
            if not exclusion[i][j]:
                # Concurrent!
                graph_edges.append([sorted_places[i]['id'], sorted_places[j]['id']])
    
    print(f"DEBUG: Generated {len(graph_edges)} concurrent edges.")
                
    return graph_nodes, graph_edges
