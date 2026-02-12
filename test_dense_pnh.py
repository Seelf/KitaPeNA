import sys
# Mock app context if needed or just import the function if possible
# Since function is inside app.py, let's copy the function logic for standalone testing or try to import it.
# Importing app might trigger server start.
# I will copy the parse_pnh logic here to verify it works as intended on the sample string.

import re

def parse_pnh_test(content):
    print(f"Parsing content:\n{content}")
    lines = []
    for l in content.splitlines():
        clean = l.strip()
        if not clean or clean.startswith('//') or (clean.startswith(';') and not clean.startswith(';Places=') and not clean.startswith(';Transitions=')):
            continue
        lines.append(clean)
    
    # Header
    num_places = int(re.match(r'\d+', lines[0]).group())
    num_rows = int(re.match(r'\d+', lines[1]).group())
    num_transitions = num_rows - 1
    
    places = [{'id': i, 'tokens': 0, 'label': f'p{i}'} for i in range(num_places)]
    transitions = [{'id': i, 'label': f't{i}'} for i in range(num_transitions)]
    
    # Metadata
    for l in content.splitlines():
        clean = l.strip()
        if clean.startswith(';Places='):
            names = clean[8:].split(';')
            for i, name in enumerate(names):
                if i < len(places): places[i].update({'label': name})
        elif clean.startswith(';Transitions='):
            names = clean[13:].split(';')
            for i, name in enumerate(names):
                if i < len(transitions): transitions[i].update({'label': name})

    # Matrix
    print(f"Matrix (Places: {num_places}, Transitions: {num_transitions}):")
    for t_idx in range(num_transitions):
        line_idx = 2 + t_idx
        current_line = lines[line_idx]
        print(f"Row {t_idx}: {current_line}")
        
    # Marking
    marking_line = lines[2 + num_transitions]
    print(f"Marking: {marking_line}")
    
    print("Places Labels:", [p['label'] for p in places])
    print("Transitions Labels:", [t['label'] for t in transitions])

sample_dense = """5
6
1000x
x1x01
0x010
010x0
001x0
01001
;Places=p2;p3;p4;p5;p1
;Transitions=t1;t2;t3;t4;t5
;Benchmark:vending_machine
"""

try:
    parse_pnh_test(sample_dense)
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
