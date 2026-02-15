from flask import Blueprint, jsonify, request
from flask_login import login_required
from web_app.data import database as db

graphs_bp = Blueprint('graphs', __name__)

@graphs_bp.route('', methods=['GET'])
@login_required
def get_graphs():
    """Retrieves all saved graphs metadata."""
    graphs = db.get_all_graphs()
    return jsonify(graphs)

@graphs_bp.route('/<int:graph_id>', methods=['GET'])
@login_required
def get_graph(graph_id):
    """Retrieves a specific graph by ID."""
    graph = db.get_graph(graph_id)
    if graph is None:
        return jsonify({'error': 'Graph not found'}), 404
    return jsonify(graph)

@graphs_bp.route('', methods=['POST'])
@login_required
def save_graph():
    """Saves a new graph to the database."""
    data = request.json
    name = data.get('name')
    nodes = data.get('nodes')
    edges = data.get('edges')
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    db.save_graph(name, nodes, edges)
    return jsonify({'status': 'success'})

@graphs_bp.route('/<int:graph_id>', methods=['DELETE'])
@login_required
def delete_graph(graph_id):
    """Deletes a graph by ID."""
    db.delete_graph(graph_id)
    return jsonify({'status': 'deleted'})
