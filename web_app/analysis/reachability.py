import collections

def calculate_reachability_graph(places, transitions, arcs, max_states=100):
    """
    Calculates the Reachability Graph (State Space) for a Petri Net.
    
    Args:
        places: List of place dicts.
        transitions: List of transition dicts.
        arcs: List of arc dicts.
        max_states: Safety limit for unbounded nets.
        
    Returns:
        nodes: List of states (MIS-compatible).
        edges: List of transitions between states.
    """
    
    # 1. Parse Input
    sorted_places = sorted(places, key=lambda p: p['id'])
    p_id_to_idx = {p['id']: i for i, p in enumerate(sorted_places)}
    
    # Initial Marking
    initial_marking = tuple([p.get('tokens', 0) for p in sorted_places])
    
    # Map Transitions
    trans_map = {}
    for t in transitions:
        trans_map[t['id']] = {
            'inputs': collections.defaultdict(int), 
            'outputs': collections.defaultdict(int), 
            'label': t.get('label', f't{t["id"]}')
        }
        
    for arc in arcs:
        weight = arc.get('weight', 1)
        arc_type = arc.get('type')
        src = arc.get('sourceId', arc.get('source'))
        tgt = arc.get('targetId', arc.get('target'))
        
        if not arc_type:
            if src in p_id_to_idx and tgt in trans_map:
                arc_type = 'place_to_transition'
            elif src in trans_map and tgt in p_id_to_idx:
                arc_type = 'transition_to_place'
                
        if arc_type == 'place_to_transition':
            if tgt in trans_map and src in p_id_to_idx:
                trans_map[tgt]['inputs'][p_id_to_idx[src]] += weight
        elif arc_type == 'transition_to_place':
            if src in trans_map and tgt in p_id_to_idx:
                trans_map[src]['outputs'][p_id_to_idx[tgt]] += weight

    # 2. BFS Exploration
    queue = collections.deque([initial_marking])
    seen = {initial_marking: 0} # State -> ID
    
    nodes_out = []
    edges_out = []
    
    # Format initial label
    init_label_parts = []
    for i, count in enumerate(initial_marking):
        if count > 0:
            p_name = sorted_places[i].get('label', f'p{sorted_places[i]["id"]}')
            init_label_parts.append(f"{count}{p_name}" if count > 1 else p_name)
    init_state_label = ", ".join(init_label_parts) if init_label_parts else "ø"

    nodes_out.append({
        'id': 0,
        'label': init_state_label,
        'marking': {sorted_places[i]['id']: count for i, count in enumerate(initial_marking)},
        'x': 0, 
        'y': 0
    })
    
    next_id = 1
    
    while queue:
        if len(seen) >= max_states:
            break
            
        current_marking = queue.popleft()
        current_id = seen[current_marking]
        
        # Fire transitions
        for t_id, t_data in trans_map.items():
            inputs = t_data['inputs']
            outputs = t_data['outputs']
            
            # Check enabled
            if any(current_marking[p_idx] < weight for p_idx, weight in inputs.items()):
                continue
            
            # Fire
            new_marking_list = list(current_marking)
            
            # Consume
            for p_idx, weight in inputs.items():
                new_marking_list[p_idx] -= weight
                
            # Produce
            for p_idx, weight in outputs.items():
                new_marking_list[p_idx] += weight
                
            new_marking = tuple(new_marking_list)
            
            # Process new state
            if new_marking not in seen:
                seen[new_marking] = next_id
                
                label_parts = []
                for i, count in enumerate(new_marking):
                    if count > 0:
                        p_name = sorted_places[i].get('label', f'p{sorted_places[i]["id"]}')
                        label_parts.append(f"{count}{p_name}" if count > 1 else p_name)
                state_label = ", ".join(label_parts) if label_parts else "ø"

                nodes_out.append({
                    'id': next_id,
                    'label': state_label,
                    'marking': {sorted_places[i]['id']: count for i, count in enumerate(new_marking)},
                    'x': 0,
                    'y': 0
                })
                queue.append(new_marking)
                next_id += 1
            
            target_id = seen[new_marking]
            edges_out.append([current_id, target_id, {'label': t_data['label']}])
    
    return nodes_out, edges_out, len(seen) >= max_states

