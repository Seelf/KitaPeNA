import os
import json
from flask import Blueprint, jsonify, request, Response
from flask_login import login_required
from web_app.data import database as db
from .utils import parse_pnh, export_pnh, export_pnml, export_gspn

petri_bp = Blueprint('petri', __name__)

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

@petri_bp.route('/import', methods=['POST'])
@login_required
def import_petri():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'}), 400
        
    if file:
        content = file.read().decode('utf-8')
        try:
            data = parse_pnh(content)
            return jsonify({'status': 'success', **data})
        except ValueError as e:
            return jsonify({'status': 'error', 'message': str(e)}), 400
    
    return jsonify({'status': 'error', 'message': 'Unknown error'}), 500

@petri_bp.route('/import_batch', methods=['POST'])
@login_required
def import_petri_batch():
    if 'files' not in request.files:
        return jsonify({'status': 'error', 'message': 'No files part'}), 400
    files = request.files.getlist('files')
    if not files:
        return jsonify({'status': 'error', 'message': 'No selected files'}), 400

    imported_count = 0
    errors = []

    conn = db.get_db_connection()
    for file in files:
        if file and file.filename.lower().endswith('.pnh'):
             try:
                 content = file.read().decode('utf-8')
                 data = parse_pnh(content)
                 
                 # Strip extension for name
                 name = file.filename
                 if name.lower().endswith('.pnh'): name = name[:-4]
                 
                 content_json = json.dumps(data)
                 conn.execute('INSERT INTO petri_nets (name, content_json) VALUES (?, ?)', (name, content_json))
                 imported_count += 1
             except Exception as e:
                 errors.append(f"{file.filename}: {str(e)}")
    
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success', 'imported_count': imported_count, 'errors': errors})

@petri_bp.route('/pnh', methods=['GET'])
@login_required
def list_pnh_files():
    """Lists .pnh files in the server's pnh_files directory."""
    pnh_dir = os.path.join(base_dir, 'pnh_files')
    if not os.path.exists(pnh_dir):
        os.makedirs(pnh_dir)
    
    files = []
    for f in os.listdir(pnh_dir):
        if f.endswith('.pnh'):
            f_path = os.path.join(pnh_dir, f)
            files.append({
                'name': f,
                'mtime': os.path.getmtime(f_path),
                'size': os.path.getsize(f_path)
            })
    
    # Sort by modification time (newest first)
    files.sort(key=lambda x: x['mtime'], reverse=True)
    return jsonify(files)

@petri_bp.route('/saved', methods=['GET'])
@login_required
def get_saved_petri_nets():
    """Retrieves paginated saved Petri nets with filtering and sorting."""
    try:
        # 1. Pagination
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        
        # 2. Sorting
        search_query = request.args.get('q', '')
        sort_param = request.args.get('sort', 'date_desc')
        
        sort_key = 'created_at'
        order = 'DESC'
        
        if '_' in sort_param:
            parts = sort_param.split('_')
            order = parts[-1].upper()
            base_key = '_'.join(parts[:-1])
            
            if base_key == 'date': sort_key = 'created_at'
            elif base_key == 'name': sort_key = 'name'
            elif base_key in ['places', 'transitions', 'arcs', 'tokens']: sort_key = base_key
            else: sort_key = 'created_at'
        else:
            sort_key = 'created_at'
            order = 'DESC'
            
        offset = (page - 1) * per_page
        
        # 3. Advanced Filters
        def get_int_param(name):
            val = request.args.get(name)
            try: return int(val) if val is not None else None
            except: return None

        min_p = get_int_param('min_p')
        min_t = get_int_param('min_t')
        min_a = get_int_param('min_a')
        min_k = get_int_param('min_k')
        model_class = request.args.get('class')
        
        data = db.get_all_petri_nets(
            limit=per_page, 
            offset=offset, 
            search_query=search_query, 
            sort_by=sort_key, 
            order=order,
            min_places=min_p,
            min_transitions=min_t,
            min_arcs=min_a,
            min_tokens=min_k,
            filter_model_class=model_class
        )
        
        return jsonify({
            'nets': data['nets'],
            'total': data['total'],
            'page': page,
            'per_page': per_page
        })
    except Exception as e:
        print(f"Error fetching nets: {e}")
        return jsonify({'error': str(e)}), 500

@petri_bp.route('/saved/<int:net_id>', methods=['GET'])
@login_required
def get_saved_petri_net(net_id):
    """Retrieves a specific Petri net by ID."""
    net = db.get_petri_net(net_id)
    if net is None:
        return jsonify({'error': 'Petri net not found'}), 404
    return jsonify(net)

@petri_bp.route('', methods=['GET'])
@login_required
def get_petri_nets():
    return get_saved_petri_nets()

@petri_bp.route('/saved', methods=['POST'])
@login_required
def save_petri_net():
    """Saves a new Petri net."""
    data = request.json
    name = data.get('name')
    content = data.get('content') # places, transitions, arcs
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    db.save_petri_net(name, content)
    return jsonify({'status': 'success'})

@petri_bp.route('/saved/<int:net_id>', methods=['DELETE'])
@login_required
def delete_petri_net(net_id):
    """Deletes a Petri net by ID."""
    db.delete_petri_net(net_id)
    return jsonify({'status': 'deleted'})

@petri_bp.route('/saved/<int:net_id>', methods=['PUT'])
@login_required
def update_petri_net(net_id):
    """Updates an existing Petri net."""
    data = request.json
    name = data.get('name')
    content = data.get('content') 

    if not name or not content:
        return jsonify({'error': 'Name and content are required'}), 400

    db.update_petri_net(net_id, name, content)
    return jsonify({'status': 'success'})

@petri_bp.route('/download/pnh/<int:net_id>')
@login_required
def download_pnh(net_id):
    """Downloads Petri net in PNH format."""
    net = db.get_petri_net(net_id)
    if not net:
        return "Net not found", 404
        
    if 'content' in net and net['content']:
        content = net['content']
    elif 'content_json' in net:
         content = json.loads(net['content_json'])
    else:
        return "Net content not found", 404
         
    pnh_data = export_pnh(content)
    
    return Response(
        pnh_data,
        mimetype="text/plain",
        headers={"Content-disposition": f"attachment; filename={net['name']}.pnh"}
    )

@petri_bp.route('/download/pnml/<int:net_id>')
@login_required
def download_pnml(net_id):
    """Downloads Petri net in PNML format."""
    net = db.get_petri_net(net_id)
    if not net:
        return "Net not found", 404
        
    if 'content' in net and net['content']:
        content = net['content']
    elif 'content_json' in net:
         content = json.loads(net['content_json'])
    else:
        return "Net content not found", 404
         
    pnml_data = export_pnml(content, net['name'])
    
    return Response(
        pnml_data,
        mimetype="application/xml",
        headers={"Content-disposition": f"attachment; filename={net['name']}.pnml"}
    )

@petri_bp.route('/download/json/<int:net_id>')
@login_required
def download_json(net_id):
    """Downloads Petri net in JSON format."""
    net = db.get_petri_net(net_id)
    if not net:
        return "Net not found", 404
        
    if 'content' in net and net['content']:
        content = net['content']
    elif 'content_json' in net:
         content = json.loads(net['content_json'])
    else:
        return "Net content not found", 404
         
    return Response(
        json.dumps(content, indent=2),
        mimetype="application/json",
        headers={"Content-disposition": f"attachment; filename={net['name']}.json"}
    )

@petri_bp.route('/download/gspn/<int:net_id>')
@login_required
def download_gspn(net_id):
    """Downloads Petri net in GSPN format (returns JSON with net and def strings)."""
    net = db.get_petri_net(net_id)
    if not net:
        return jsonify({'error': 'Net not found'}), 404
        
    if 'content' in net and net['content']:
        content = net['content']
    elif 'content_json' in net:
         content = json.loads(net['content_json'])
    else:
        return jsonify({'error': 'Net content not found'}), 404
         
    gspn_data = export_gspn(content)
    
    return jsonify({
        'net_filename': f"{net['name']}.net",
        'net_content': gspn_data['net'],
        'def_filename': f"{net['name']}.def",
        'def_content': gspn_data['def']
    })
