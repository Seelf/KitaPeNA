import math
import xml.etree.ElementTree as ET

def parse_pnh(content):
    """Parses PNH (Petri Net Hypergraph logic) file content."""
    # Handle BOM
    if content.startswith('\ufeff'):
        content = content[1:]
        
    lines = []
    for l in content.splitlines():
        clean = l.strip()
        # Skip empty lines, comments (#, //, ;)
        if not clean or clean.startswith(('#', '//', ';')):
            continue
        lines.append(clean)
        
    if len(lines) < 3:
        raise ValueError("Invalid PNH file format")
    
    # Header: |P|, |Rows|
    try:
        num_places = int(lines[0].split()[0])
    except Exception as e:
        raise ValueError(f"Line 1 (Places Count): '{lines[0]}' - {str(e)}")

    try:
        num_rows = int(lines[1].split()[0])
    except Exception as e:
         raise ValueError(f"Line 2 (Rows Count): '{lines[1]}' - {str(e)}")
    
    # PNH logic: |T| = |Rows| - 1 (Last row is Marking)
    num_transitions = num_rows - 1
    
    places = [{'id': i, 'tokens': 0, 'label': f'p{i}'} for i in range(num_places)]
    transitions = [{'id': i, 'label': f't{i}'} for i in range(num_transitions)]
    arcs = []
    
    # Parse Incidence Matrix
    for t_idx in range(num_transitions):
        line_idx = 2 + t_idx
        if line_idx >= len(lines): break
        
        current_line = lines[line_idx]
        try:
            # Check format: Space-separated or Dense
            if ' ' in current_line:
                 row_vals = list(map(int, current_line.split()))
            else:
                 # Dense: '1', '0', 'x' -> 1, 0, -1
                 row_vals = []
                 for char in current_line:
                     if char == '1': row_vals.append(1)
                     elif char == '0': row_vals.append(0)
                     elif char.lower() == 'x': row_vals.append(-1)
                     else: row_vals.append(0)
            
            for p_idx, val in enumerate(row_vals):
                if p_idx >= num_places: break
                
                if val == -1:
                        # Place -> Transition
                        arcs.append({
                            'sourceId': p_idx,
                            'targetId': t_idx,
                            'type': 'place_to_transition',
                            'weight': 1
                        })
                elif val == 1:
                        # Transition -> Place
                        arcs.append({
                            'sourceId': t_idx,
                            'targetId': p_idx,
                            'type': 'transition_to_place',
                            'weight': 1
                        })
        except Exception as e:
             raise ValueError(f"Line {line_idx+1} (Matrix Row {t_idx}): '{current_line}' - {str(e)}")
    
    # Parse Initial Marking (Last row)
    marking_row_idx = 2 + num_transitions
    if marking_row_idx < len(lines):
        try:
            line_content = lines[marking_row_idx]
            if ' ' in line_content:
                marking_vals = list(map(int, line_content.split()))
            else:
                # Dense marking: Assume single digit tokens
                marking_vals = []
                for char in line_content:
                    if char.isdigit(): marking_vals.append(int(char))
                    else: marking_vals.append(0)

            for p_idx, tokens in enumerate(marking_vals):
                if p_idx < len(places):
                    places[p_idx]['tokens'] = tokens
        except Exception as e:
             raise ValueError(f"Line {marking_row_idx+1} (Marking): '{lines[marking_row_idx]}' - {str(e)}")
                
    return {'places': places, 'transitions': transitions, 'arcs': arcs}

def normalize_arcs(arcs, place_ids, transition_ids):
    """Normalize arcs to ensure sourceId, targetId, type fields exist."""
    normalized = []
    for arc in arcs:
        if 'type' in arc and 'sourceId' in arc:
            normalized.append(arc)
        else:
            src = arc.get('source', arc.get('sourceId'))
            tgt = arc.get('target', arc.get('targetId'))
            weight = arc.get('weight', 1)
            
            if src in place_ids and tgt in transition_ids:
                normalized.append({'sourceId': src, 'targetId': tgt, 'type': 'place_to_transition', 'weight': weight})
            elif src in transition_ids and tgt in place_ids:
                normalized.append({'sourceId': src, 'targetId': tgt, 'type': 'transition_to_place', 'weight': weight})
    return normalized

def export_pnh(data):
    """Converts a Petri net dict to PNH string format."""
    places = data.get('places', [])
    transitions = data.get('transitions', [])
    raw_arcs = data.get('arcs', [])
    
    num_places = len(places)
    num_transitions = len(transitions)
    
    # Sort for consistency
    places.sort(key=lambda x: x['id'])
    transitions.sort(key=lambda x: x['id'])
    
    p_ids = {p['id'] for p in places}
    t_ids = {t['id'] for t in transitions}
    arcs = normalize_arcs(raw_arcs, p_ids, t_ids)
    
    p_map = {p['id']: i for i, p in enumerate(places)}
    
    lines = []
    
    # Header
    lines.append(f"{num_places}")
    lines.append(f"{num_transitions + 1}")
    lines.append("")

    # Matrix Rows
    for t in transitions:
        row_chars = ['0'] * num_places
        
        # Incoming: -1 -> 'x'
        for arc in arcs:
            if arc['type'] == 'place_to_transition' and arc['targetId'] == t['id']:
                pid = arc['sourceId']
                if pid in p_map:
                    row_chars[p_map[pid]] = 'x'
                    
        # Outgoing: +1 -> '1'
        for arc in arcs:
            if arc['type'] == 'transition_to_place' and arc['sourceId'] == t['id']:
                pid = arc['targetId']
                if pid in p_map:
                    row_chars[p_map[pid]] = '1'
        
        lines.append("".join(row_chars))
        
    # Initial Marking
    marking_chars = []
    for p in places:
        tokens = p.get('tokens', 0)
        marking_chars.append(str(tokens) if tokens < 10 else '9') 
            
    lines.append("".join(marking_chars))
    
    # Metadata (Extended PNH)
    lines.append("")
    p_names = [p.get('label', f"p{p['id']}") for p in places]
    lines.append(f";Places={';'.join(p_names)}")
    
    t_names = [t.get('label', f"t{t['id']}") for t in transitions]
    lines.append(f";Transitions={';'.join(t_names)}")
    
    return "\n".join(lines)

def export_pnml(data, net_name="petrinet"):
    """Exports Petri net to standard PNML format."""
    places = data.get('places', [])
    transitions = data.get('transitions', [])
    raw_arcs = data.get('arcs', [])
    
    p_ids = {p['id'] for p in places}
    t_ids = {t['id'] for t in transitions}
    arcs = normalize_arcs(raw_arcs, p_ids, t_ids)
    
    pnml = ET.Element('pnml')
    net = ET.SubElement(pnml, 'net', id=net_name, type="http://www.pnml.org/version-2009/grammar/ptnet")
    
    # Places
    for p in places:
        place_el = ET.SubElement(net, 'place', id=f"p{p['id']}")
        name = ET.SubElement(place_el, 'name')
        ET.SubElement(name, 'text').text = p.get('label', f"p{p['id']}")
        init_mark = ET.SubElement(place_el, 'initialMarking')
        ET.SubElement(init_mark, 'text').text = str(p.get('tokens', 0))
        
        if 'x' in p and 'y' in p:
            graphics = ET.SubElement(place_el, 'graphics')
            ET.SubElement(graphics, 'position', x=str(p['x']), y=str(p['y']))

    # Transitions
    for t in transitions:
        trans_el = ET.SubElement(net, 'transition', id=f"t{t['id']}")
        name = ET.SubElement(trans_el, 'name')
        ET.SubElement(name, 'text').text = t.get('label', f"t{t['id']}")
        
        if 'x' in t and 'y' in t:
            graphics = ET.SubElement(trans_el, 'graphics')
            ET.SubElement(graphics, 'position', x=str(t['x']), y=str(t['y']))

    # Arcs
    for i, arc in enumerate(arcs):
        if arc['type'] == 'place_to_transition':
            src = f"p{arc['sourceId']}"
            tgt = f"t{arc['targetId']}"
        else:
            src = f"t{arc['sourceId']}"
            tgt = f"p{arc['targetId']}"
            
        arc_el = ET.SubElement(net, 'arc', id=f"a{i}", source=src, target=tgt)
        inscription = ET.SubElement(arc_el, 'inscription')
        ET.SubElement(inscription, 'text').text = str(arc.get('weight', 1))

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(pnml, encoding='unicode')

def export_gspn(data):
    """Exports Petri net to GSPN format (.net and .def strings)."""
    places = data.get('places', [])
    transitions = data.get('transitions', [])
    raw_arcs = data.get('arcs', [])
    
    # Sort for consistency
    places.sort(key=lambda x: x['id'])
    transitions.sort(key=lambda x: x['id'])
    
    p_ids = {p['id'] for p in places}
    t_ids = {t['id'] for t in transitions}
    arcs = normalize_arcs(raw_arcs, p_ids, t_ids)
    
    P = len(places)
    T = len(transitions)
    
    # 1-based indexing map for places
    p_map_1based = {p['id']: i + 1 for i, p in enumerate(places)}
    
    cx, cy = 10.0, 10.0
    Rp, Rt = 6.0, 9.0
    place_pos = []
    for i in range(P):
        ang = 2 * math.pi * i / max(1, P)
        x = cx + Rp * math.cos(ang)
        y = cy + Rp * math.sin(ang)
        place_pos.append((x, y, x, y + 0.5))
        
    tr_pos = []
    for j in range(T):
        ang = 2 * math.pi * j / max(1, T)
        x = cx + Rt * math.cos(ang)
        y = cy + Rt * math.sin(ang)
        tr_pos.append((x, y, x + 0.4, y + 0.4, x + 0.2, y - 0.4))

    inputs = [[] for _ in range(T)]
    outputs = [[] for _ in range(T)]
    
    # t_id to index 0...T-1
    t_map = {t['id']: j for j, t in enumerate(transitions)}
    
    for arc in arcs:
        weight = int(arc.get('weight', 1))
        if arc['type'] == 'place_to_transition':
            t_idx = t_map.get(arc['targetId'])
            p_idx_1 = p_map_1based.get(arc['sourceId'])
            if t_idx is not None and p_idx_1 is not None:
                inputs[t_idx].append((p_idx_1, weight))
        elif arc['type'] == 'transition_to_place':
            t_idx = t_map.get(arc['sourceId'])
            p_idx_1 = p_map_1based.get(arc['targetId'])
            if t_idx is not None and p_idx_1 is not None:
                outputs[t_idx].append((p_idx_1, weight))
                
    net_lines = []
    net_lines.append("|0|\n|")
    net_lines.append(f"f 0 {P} 0 {T} 0 0 0")
    
    for i in range(P):
        p = places[i]
        name = p.get('label', f"p{p['id']}")
        name = name.replace(' ', '_').replace('-', '_').replace('+', '_')
        if not name.strip():
            name = f"p{p['id']}"
        m0 = p.get('tokens', 0)
        x, y, lx, ly = place_pos[i]
        net_lines.append(f"{name} {m0} {x:.4f} {y:.4f} {lx:.4f} {ly:.4f} 0")
        
    for j in range(T):
        t = transitions[j]
        name = t.get('label', f"t{t['id']}")
        name = name.replace(' ', '_').replace('-', '_').replace('+', '_')
        if not name.strip():
            name = f"t{t['id']}"
        x, y, tagx, tagy, ratex, ratey = tr_pos[j]
        m_in = inputs[j]
        m_out = outputs[j]
        
        net_lines.append(f"{name} 1.0 0 0 {len(m_in)} 1 {x:.4f} {y:.4f} {tagx:.4f} {tagy:.4f} {ratex:.4f} {ratey:.4f} 0")
        for (p_idx, mult) in m_in:
            net_lines.append(f"   {mult} {p_idx} 0 0")
            
        net_lines.append(f"   {len(m_out)}")
        for (p_idx, mult) in m_out:
            net_lines.append(f"   {mult} {p_idx} 0 0")
            
        net_lines.append("   0")
        
    net_content = "\n".join(net_lines) + "\n"
    def_content = "|256\n%\n|\n"
    
    return {'net': net_content, 'def': def_content}
