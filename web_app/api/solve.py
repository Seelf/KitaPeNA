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
    Solves the Maximum Independent Set problem for the provided graph.
    Streamed response (Server-Sent Events) for incremental results.
    """
    try:
        data = request.json
        
        # Check if this is a Petri Net request
        if 'places' in data and 'transitions' in data:
            def generate_petri():
                # Petri Net Reachability
                places = data.get('places', [])
                transitions = data.get('transitions', [])
                arcs = data.get('arcs', [])
                
                # Calculate Reachability Graph
                nodes_out, edges_out, _ = petri_reachability.calculate_reachability_graph(places, transitions, arcs)
                
                # Yield Graph Structure
                graph_data = {
                    'type': 'new_graph',
                    'nodes': nodes_out,
                    'edges': edges_out
                }
                yield f"data: {json.dumps(graph_data)}\n\n"
                
                # Calculate MIS on this Reachability Graph
                G_reach = nx.Graph()
                for n in nodes_out:
                    G_reach.add_node(n['id'], label=n['label'])
                for e in edges_out:
                    G_reach.add_edge(e[0], e[1])

                print(f"DEBUG: Generating MIS for Reachability Graph. Nodes: {len(nodes_out)}")
                generator = mis_core.mis_algorithm_generator(G_reach)
                count = 0
                for i, (mis_set, msg) in enumerate(generator):
                     count += 1
                     print(f"DEBUG: Yielding MIS step {i}: {mis_set}")
                     step_data = {
                         'mis': list(mis_set),
                         'message': msg,
                         'index': i
                     }
                     yield f"data: {json.dumps(step_data)}\n\n"
                     
                print(f"DEBUG: Finished yielding. Total steps: {count}")
                yield "data: [DONE]\n\n"

            return Response(stream_with_context(generate_petri()), mimetype='text/event-stream')

        # Standard MIS on Graph (Existing Logic)
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        # reconstruct graph
        G = nx.Graph()
        G.add_nodes_from(nodes)
        G.add_edges_from(edges)
        
        def generate_mis():
            # Run algorithm generator
            generator = mis_core.mis_algorithm_generator(G)
            
            for i, (mis_set, msg) in enumerate(generator):
                step_data = {
                    'mis': list(mis_set),
                    'message': msg,
                    'index': i
                }
                yield f"data: {json.dumps(step_data)}\n\n"
            
            # End of stream indicator
            yield "data: [DONE]\n\n"

        return Response(stream_with_context(generate_mis()), mimetype='text/event-stream')
        
    except Exception as e:
        print(f"Solve Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
