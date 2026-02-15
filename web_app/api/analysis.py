from flask import Blueprint, jsonify, request
from flask_login import login_required
try:
    from web_app.analysis import transitivity
    from web_app.analysis import coloring
except ImportError as e:
    print(f"Warning: Could not import analysis modules: {e}")
    transitivity = None
    coloring = None

analysis_bp = Blueprint('analysis', __name__)

@analysis_bp.route('/transitivity', methods=['POST'])
@login_required
def check_transitivity():
    """Checks if the graph is Transitively Orientable."""
    try:
        data = request.json
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        if transitivity is None:
             return jsonify({'error': 'Transitivity module not loaded'}), 500

        result = transitivity.check_transitive_orientability(nodes, edges)
        
        return jsonify({
            'status': 'success',
            **result
        })
    except Exception as e:
        print(f"Transitivity Analysis Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@analysis_bp.route('/coloring', methods=['POST'])
@login_required
def get_coloring():
    """Computes Optimal Coloring."""
    try:
        data = request.json
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        if coloring is None:
            return jsonify({'error': 'Coloring module not loaded'}), 500

        result = coloring.get_optimal_coloring(nodes, edges)
        
        return jsonify({
            'status': 'success',
            **result
        })
    except Exception as e:
        print(f"Coloring Analysis Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
