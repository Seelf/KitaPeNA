from flask import Blueprint, jsonify, request
from flask_login import login_required
from web_app.extensions_setup import limiter
from web_app.analysis import reachability as petri_reachability
try:
    from web_app.analysis import concurrency as petri_analysis
except ImportError as e:
    print(f"Warning: Could not import analysis modules: {e}")
    petri_analysis = None

petri_analysis_bp = Blueprint('petri_analysis', __name__)

@petri_analysis_bp.route('/reachability', methods=['POST'])
@login_required
@limiter.limit("30 per minute")
def calculate_reachability():
    """Calculates the Reachability Graph (State Space)."""
    try:
        data = request.json
        places = data.get('places', [])
        transitions = data.get('transitions', [])
        arcs = data.get('arcs', [])
        max_states = int(data.get('max_states', 100))
        
        nodes, edges, truncated = petri_reachability.calculate_reachability_graph(places, transitions, arcs, max_states)
        
        return jsonify({
            'status': 'success',
            'nodes': nodes,
            'edges': edges,
            'truncated': truncated
        })
    except Exception as e:
        print(f"Reachability Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@petri_analysis_bp.route('/concurrency', methods=['POST'])
@login_required
def calculate_concurrency():
    """Calculates the Concurrency Place Relation Graph."""
    try:
        data = request.json
        places = data.get('places', [])
        transitions = data.get('transitions', [])
        arcs = data.get('arcs', [])
        
        if petri_analysis is None:
            return jsonify({'status': 'error', 'message': 'Petri Analysis module not available'}), 500

        nodes, edges = petri_analysis.build_concurrency_graph(places, transitions, arcs)
        
        return jsonify({
            'status': 'success',
            'nodes': nodes,
            'edges': edges
        })
    except Exception as e:
        print(f"Concurrency Analysis Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
