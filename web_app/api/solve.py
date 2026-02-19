from flask import Blueprint, jsonify, request, Response, stream_with_context
from flask_login import login_required
from web_app.extensions_setup import limiter
import json
import networkx as nx
from web_app.analysis import mis as mis_core
from web_app.analysis import reachability as petri_reachability

solve_bp = Blueprint('solve', __name__)

@solve_bp.route('', methods=['POST'])
@login_required
@limiter.limit("30 per minute")
def solve_mis():
    """
    Solves Max Independent Set. 
    Streamed response (SSE) for incremental results.
    """
    try:
        data = request.json
        
        # Petri Net Request?
        if 'places' in data and 'transitions' in data:
            def generate_petri():
                # 1. Petri Net Reachability
                places = data.get('places', [])
                transitions = data.get('transitions', [])
                arcs = data.get('arcs', [])
                
                nodes_out, edges_out, _ = petri_reachability.calculate_reachability_graph(places, transitions, arcs)
                
                # Yield Reachability Graph
                graph_data = {
                    'type': 'new_graph',
                    'nodes': nodes_out,
                    'edges': edges_out
                }
                yield f"data: {json.dumps(graph_data)}\n\n"
                
                # 2. Calculate MIS on Reachability Graph
                G_reach = nx.Graph()
                for n in nodes_out:
                    G_reach.add_node(n['id'], label=n['label'])
                for e in edges_out:
                    G_reach.add_edge(e[0], e[1])

                print(f"DEBUG: MIS on Reachability Graph. Nodes: {len(nodes_out)}")
                
                generator = mis_core.mis_algorithm_generator(G_reach)
                count = 0
                for i, (mis_set, msg) in enumerate(generator):
                     count += 1
                     step_data = {
                         'mis': list(mis_set),
                         'message': msg,
                         'index': i
                     }
                     yield f"data: {json.dumps(step_data)}\n\n"
                     
                print(f"DEBUG: Finished. Total steps: {count}")
                yield "data: [DONE]\n\n"

            return Response(stream_with_context(generate_petri()), mimetype='text/event-stream')

        # Standard MIS on Graph (Nodes/Edges)
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        G = nx.Graph()
        G.add_nodes_from(nodes)
        G.add_edges_from(edges)
        
        def generate_mis():
            generator = mis_core.mis_algorithm_generator(G)
            
            for i, (mis_set, msg) in enumerate(generator):
                step_data = {
                    'mis': list(mis_set),
                    'message': msg,
                    'index': i
                }
                yield f"data: {json.dumps(step_data)}\n\n"
            
            yield "data: [DONE]\n\n"

        return Response(stream_with_context(generate_mis()), mimetype='text/event-stream')
        
    except Exception as e:
        print(f"Solve Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
