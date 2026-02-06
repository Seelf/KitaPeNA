import collections

def calculate_reachability_graph(places, transitions, arcs, max_states=100):
    """
    Calculates the Reachability Graph (State Space) for a Petri Net.
    
    Args:
        places: List of dicts [{'id': 1, 'tokens': 0, ...}, ...]
        transitions: List of dicts [{'id': 1, 'label': 't1', ...}, ...]
        arcs: List of dicts [{'sourceId': 1, 'targetId': 1, 'type': '...', 'weight': 1}, ...]
        max_states: Limit to prevent infinite loops in unbounded nets.
        
    Returns:
        nodes: List of states (each state is a MIS-compatible node).
        edges: List of transitions between states.
    """
    
    # 1. Parse Input into fast lookup structures
    # Place Mapping: ID -> Index in state vector
    sorted_places = sorted(places, key=lambda p: p['id'])
    p_id_to_idx = {p['id']: i for i, p in enumerate(sorted_places)}
    idx_to_p_id = {i: p['id'] for i, p in enumerate(sorted_places)}
    
    # Initial Marking (State Vector)
    initial_marking = tuple([p.get('tokens', 0) for p in sorted_places])
    
    # Transition Logic
    # transition_id -> { inputs: {p_idx: weight}, outputs: {p_idx: weight}, label: str }
    trans_map = {}
    for t in transitions:
        trans_map[t['id']] = {'inputs': collections.defaultdict(int), 'outputs': collections.defaultdict(int), 'label': t.get('label', f't{t["id"]}')}
        
    for arc in arcs:
        weight = arc.get('weight', 1)
        if arc['type'] == 'place_to_transition':
            # Input to transition
            t_id = arc['targetId']
            p_id = arc['sourceId']
            if t_id in trans_map and p_id in p_id_to_idx:
                p_idx = p_id_to_idx[p_id]
                trans_map[t_id]['inputs'][p_idx] += weight
        elif arc['type'] == 'transition_to_place':
            # Output from transition
            t_id = arc['sourceId']
            p_id = arc['targetId']
            if t_id in trans_map and p_id in p_id_to_idx:
                p_idx = p_id_to_idx[p_id]
                trans_map[t_id]['outputs'][p_idx] += weight

    # 2. BFS State Space Exploration
    queue = collections.deque([initial_marking])
    seen = {initial_marking: 0} # State -> ID (0, 1, 2...)
    
    # MIS Graph Format
    # Nodes: { id: int, label: str (marking), x: ?, y: ? }
    # Edges: [source_id, target_id] (We lose label in MIS edge format usually, but we can try to encode it or just keep structure)
    # Actually MIS Edges are [id1, id2]. Directed? MIS is undirected usually.
    # But Reachability Graph IS directed. 
    # The existing MIS Editor supports directed edges visually (arrows), but underlying logic is usually undirected for MIS algo.
    # However, for visualization, we just need nodes and edges.
    
    nodes_out = []
    edges_out = []
    
    # Format initial label
    init_label_parts = []
    for i, count in enumerate(initial_marking):
        if count > 0:
            p_name = sorted_places[i].get('label', f'p{sorted_places[i]["id"]}')
            if count > 1:
                init_label_parts.append(f"{count}{p_name}")
            else:
                init_label_parts.append(p_name)
    init_state_label = ", ".join(init_label_parts) if init_label_parts else "ø"

    # Add initial node
    nodes_out.append({
        'id': 0,
        'label': init_state_label,
        # Layout will be handled by force-directed algo on frontend if x/y 0
        'x': 0, 
        'y': 0
    })
    
    next_id = 1
    
    while queue:
        if len(seen) >= max_states:
            break
            
        current_marking = queue.popleft()
        current_id = seen[current_marking]
        
        # Try to fire every transition
        for t_id, t_data in trans_map.items():
            inputs = t_data['inputs']
            outputs = t_data['outputs']
            
            # Check enabled
            enabled = True
            for p_idx, weight in inputs.items():
                if current_marking[p_idx] < weight:
                    enabled = False
                    break
            
            if enabled:
                # Fire!
                new_marking_list = list(current_marking)
                
                # Consume tokens
                for p_idx, weight in inputs.items():
                    new_marking_list[p_idx] -= weight
                    
                # Produce tokens
                for p_idx, weight in outputs.items():
                    new_marking_list[p_idx] += weight
                    
                new_marking = tuple(new_marking_list)
                
                # Process new state
                if new_marking not in seen:
                    seen[new_marking] = next_id
                    
                    # specific formatting: "p1, 2p2"
                    label_parts = []
                    for i, count in enumerate(new_marking):
                        if count > 0:
                            p_name = sorted_places[i].get('label', f'p{sorted_places[i]["id"]}')
                            if count > 1:
                                label_parts.append(f"{count}{p_name}")
                            else:
                                label_parts.append(p_name)
                    state_label = ", ".join(label_parts) if label_parts else "ø" # Empty marking?

                    nodes_out.append({
                        'id': next_id,
                        'label': state_label,
                        'x': 0,
                        'y': 0
                    })
                    queue.append(new_marking)
                    next_id += 1
                
                target_id = seen[new_marking]
                
                # Add Edge
                # MIS Edge format extended to [id1, id2, attributes_dict] for Reachability Graph
                # NetworkX expects the 3rd element to be a dict.
                edges_out.append([current_id, target_id, {'label': t_data['label']}])
                
    return nodes_out, edges_out
