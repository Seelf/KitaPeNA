import json

def export_pnh(data):
    places = data.get('places', [])
    transitions = data.get('transitions', [])
    arcs = data.get('arcs', [])
    
    num_places = len(places)
    num_transitions = len(transitions)
    
    lines = []
    
    # Header
    lines.append(f"{num_places} places")
    lines.append(f"{num_transitions + 1} rows") # +1 for marking
    
    # Sort places and transitions by ID
    places.sort(key=lambda x: x['id'])
    transitions.sort(key=lambda x: x['id'])
    
    p_map = {p['id']: i for i, p in enumerate(places)}
    
    # Build Matrix for each transition
    for t in transitions:
        row = [0] * num_places
        
        # Incoming arcs (Place -> Transition): -1
        for arc in arcs:
            if arc['type'] == 'place_to_transition' and arc['targetId'] == t['id']:
                pid = arc['sourceId']
                if pid in p_map:
                    row[p_map[pid]] = -1
                    
        # Outgoing arcs (Transition -> Place): +1
        for arc in arcs:
            if arc['type'] == 'transition_to_place' and arc['sourceId'] == t['id']:
                pid = arc['targetId']
                if pid in p_map:
                    row[p_map[pid]] = 1
        
        lines.append(" ".join(map(str, row)))
        
    # Initial Marking (Last row)
    marking_row = [0] * num_places
    for p in places:
        if p['id'] in p_map:
            marking_row[p_map[p['id']]] = p.get('tokens', 0)
            
    lines.append(" ".join(map(str, marking_row)))
    
    return "\n".join(lines)

# Sample Data matching test_network.pnh logic essentially
# 4 places, 1 transition (row 0), 1 marking (row 1)
# But test_network.pnh has 4 places, 2 rows.
# Row 0: -1 1 0 0 => T0 input P0, output P1.
# Row 1: 0 0 1 1 => Marking P2=1, P3=1.

data = {
    "places": [
        {"id": 0, "tokens": 0},
        {"id": 1, "tokens": 0},
        {"id": 2, "tokens": 1},
        {"id": 3, "tokens": 1}
    ],
    "transitions": [
        {"id": 0}
    ],
    "arcs": [
        {"sourceId": 0, "targetId": 0, "type": "place_to_transition"},
        {"sourceId": 0, "targetId": 1, "type": "transition_to_place"}
    ]
}

print("--- Python export_pnh output ---")
print(export_pnh(data))
