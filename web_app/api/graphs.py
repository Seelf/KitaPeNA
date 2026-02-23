from flask import Blueprint, jsonify, request, Response
from flask_login import login_required
from web_app.data import database as db
import json
import io
import networkx as nx

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
    is_directed = data.get('is_directed', False)
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    db.save_graph(name, nodes, edges, is_directed)
    return jsonify({'status': 'success'})

@graphs_bp.route('/<int:graph_id>', methods=['DELETE'])
@login_required
def delete_graph(graph_id):
    """Deletes a graph by ID."""
    db.delete_graph(graph_id)
    return jsonify({'status': 'deleted'})

@graphs_bp.route('/download/<format>/<int:graph_id>', methods=['GET'])
@login_required
def download_graph(format, graph_id):
    """Exports a graph to a specific format."""
    graph_data = db.get_graph(graph_id)
    if not graph_data:
        return jsonify({'error': 'Graph not found'}), 404
        
    nodes = json.loads(graph_data['nodes']) if isinstance(graph_data['nodes'], str) else graph_data['nodes']
    edges = json.loads(graph_data['edges']) if isinstance(graph_data['edges'], str) else graph_data['edges']
    is_directed = bool(graph_data.get('is_directed', False))
    
    if format == 'json':
        export_data = {
            'name': graph_data['name'],
            'is_directed': is_directed,
            'nodes': nodes,
            'edges': edges
        }
        return Response(
            json.dumps(export_data, indent=2),
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment;filename={graph_data["name"]}.json'}
        )
        
    G = nx.DiGraph() if is_directed else nx.Graph()
    for n in nodes:
        node_kwargs = {k: v for k, v in n.items() if k != 'id'}
        G.add_node(n['id'], **node_kwargs)
    for e in edges:
        G.add_edge(e[0], e[1])
        
    output = io.BytesIO()
    
    if format == 'gml':
        nx.write_gml(G, output)
        filename = f"{graph_data['name']}.gml"
        mimetype = 'text/plain'
    elif format == 'graphml':
        nx.write_graphml(G, output)
        filename = f"{graph_data['name']}.graphml"
        mimetype = 'application/xml'
    elif format == 'edgelist':
        nx.write_edgelist(G, output)
        filename = f"{graph_data['name']}.edgelist"
        mimetype = 'text/plain'
    else:
        return jsonify({'error': 'Unsupported format'}), 400
        
    output.seek(0)
    return Response(
        output.read(),
        mimetype=mimetype,
        headers={'Content-Disposition': f'attachment;filename={filename}'}
    )

@graphs_bp.route('/import', methods=['POST'])
@login_required
def import_graph():
    """Imports a graph from a file."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
        
    file = request.files['file']
    filename = file.filename
    content = file.read()
    
    try:
        if filename.endswith('.json'):
            data = json.loads(content)
            # Ensure proper format
            nodes = data.get('nodes', [])
            edges = data.get('edges', [])
            is_directed = data.get('is_directed', False)
            return jsonify({
                'name': filename.split('.')[0],
                'nodes': nodes,
                'edges': edges,
                'is_directed': is_directed
            })
            
        # For networkx formats
        content_io = io.BytesIO(content)
        G = None
        
        if filename.endswith('.gml'):
            G = nx.read_gml(content_io)
        elif filename.endswith('.graphml'):
            G = nx.read_graphml(content_io)
        elif filename.endswith('.edgelist'):
            G = nx.read_edgelist(content_io)
        else:
            return jsonify({'error': 'Unsupported file format for generic graphs. Use .json, .gml, .graphml, or .edgelist'}), 400
            
        nodes = []
        # Mapping string IDs from some formats back to integers if needed
        node_map = {}
        for idx, (n_id, data) in enumerate(G.nodes(data=True)):
            numeric_id = idx
            if isinstance(n_id, int) or (isinstance(n_id, str) and n_id.isdigit()):
                numeric_id = int(n_id)
            node_map[n_id] = numeric_id
            
            node_data = {'id': numeric_id, 'x': 0, 'y': 0}
            # Attempt to carry over layout positions if they exist
            if 'x' in data and 'y' in data:
                node_data['x'] = float(data['x'])
                node_data['y'] = float(data['y'])
            nodes.append(node_data)
            
        edges = []
        for u, v in G.edges():
            edges.append([node_map[u], node_map[v]])
            
        is_directed = G.is_directed()
        
        return jsonify({
            'name': filename.split('.')[0],
            'nodes': nodes,
            'edges': edges,
            'is_directed': is_directed
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to parse file: {str(e)}'}), 400
