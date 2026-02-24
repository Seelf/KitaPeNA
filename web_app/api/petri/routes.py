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
        prop_filters_str = request.args.get('prop_filters')
        prop_filters = []
        if prop_filters_str:
            try:
                import json
                prop_filters = json.loads(prop_filters_str)
            except Exception as e:
                print(f"Error parsing prop_filters: {e}")
                
        model_class = request.args.get('class')
        metadata_search = request.args.get('meta_search', '').strip()
        metadata_regex = request.args.get('meta_regex', '').strip()
        
        data = db.get_all_petri_nets(
            limit=per_page, 
            offset=offset, 
            search_query=search_query, 
            sort_by=sort_key, 
            order=order,
            prop_filters=prop_filters,
            filter_model_class=model_class,
            metadata_search=metadata_search if metadata_search else None,
            metadata_regex=metadata_regex if metadata_regex else None
        )
        
        # 4. Get total absolute count (no filters)
        conn = db.get_db_connection()
        res_abs = db.execute_query(conn, 'SELECT COUNT(*) FROM petri_nets', fetchone=True)
        total_db = list(res_abs.values())[0] if res_abs else 0
        conn.close()
        
        return jsonify({
            'nets': data['nets'],
            'total': data['total'],
            'total_db': total_db,
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

# --- Custom Parsers ---

@petri_bp.route('/parsers', methods=['GET'])
@login_required
def get_parsers():
    parsers = db.get_all_parsers()
    return jsonify(parsers)

@petri_bp.route('/parsers', methods=['POST'])
@login_required
def create_parser():
    data = request.json
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    
    desc = data.get('description', '')
    rules = data.get('rules', [])
    sample = data.get('sample_input', '')
    
    db.save_parser(name, desc, rules, sample)
    return jsonify({'status': 'success'}), 201

@petri_bp.route('/parsers/<int:parser_id>', methods=['PUT'])
@login_required
def update_parser(parser_id):
    data = request.json
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400
        
    desc = data.get('description', '')
    rules = data.get('rules', [])
    sample = data.get('sample_input', '')
    
    db.update_parser(parser_id, name, desc, rules, sample)
    return jsonify({'status': 'success'})

@petri_bp.route('/parsers/<int:parser_id>', methods=['DELETE'])
@login_required
def delete_parser(parser_id):
    db.delete_parser(parser_id)
    return jsonify({'status': 'deleted'})

@petri_bp.route('/parsers/test', methods=['POST'])
@login_required
def test_parser():
    """Applies extraction rules to the provided sample_input and returns the parsed JSON."""
    data = request.json
    rules = data.get('rules', [])
    text = data.get('sample_input', '')
    
    import re
    
    result = {
        'places': [],
        'transitions': [],
        'arcs': [],
        'metadata': {'raw': ''}
    }
    
    try:
        lines = text.splitlines()
        
        for rule in rules:
            target = rule.get('target')
            method = rule.get('method')
            pattern = rule.get('pattern', '')
            transform = rule.get('transform', '')
            
            extracted_text = ""
            
            # 1. Extract text based on method
            if method == 'regex' and pattern:
                flags = rule.get('flags', 'gm')
                re_flags = 0
                if 'i' in flags: re_flags |= re.IGNORECASE
                if 'm' in flags: re_flags |= re.MULTILINE
                
                try:
                    matches = re.finditer(pattern, text, re_flags)
                    extracted_parts = []
                    for m in matches:
                        # If there are capture groups, use the first one, else the whole match
                        if m.lastindex:
                            extracted_parts.append(m.group(1).strip())
                        else:
                            extracted_parts.append(m.group(0).strip())
                    extracted_text = "\n".join(extracted_parts)
                except re.error as e:
                    return jsonify({'error': f"Regex error in rule for {target}: {str(e)}"}), 400
                    
            elif method == 'lines':
                start_line = int(rule.get('startLine', 1)) - 1
                end_line = int(rule.get('endLine', len(lines)))
                # Bounds check
                start_line = max(0, start_line)
                end_line = min(len(lines), end_line)
                if start_line < end_line:
                    extracted_text = "\n".join(lines[start_line:end_line])

            if not extracted_text:
                continue

            # 2. Transform into target schema
            if target == 'metadata':
                if transform == 'join_newline':
                    result['metadata']['raw'] += ("\n" + extracted_text) if result['metadata']['raw'] else extracted_text
                else:
                    result['metadata']['raw'] += ("\n" + extracted_text) if result['metadata']['raw'] else extracted_text

            elif target in ['places', 'transitions']:
                names = []
                if transform == 'split_comma':
                    names = [n.strip() for n in extracted_text.split(',') if n.strip()]
                elif transform == 'split_newline':
                    names = [n.strip() for n in extracted_text.splitlines() if n.strip()]
                elif transform == 'split_semicolon':
                    names = [n.strip() for n in extracted_text.split(';') if n.strip()]
                else: 
                    # fallback
                    names = [n.strip() for n in extracted_text.splitlines() if n.strip()]
                
                # Append to existing
                arr = result[target]
                start_id = len(arr)
                for i, name in enumerate(names):
                    if target == 'places':
                        arr.append({"id": start_id + i, "label": name, "tokens": 0})
                    else:
                        arr.append({"id": start_id + i, "label": name})

            elif target == 'arcs':
                if transform == 'arc_pairs':
                    # Expects format like "p1->t1\nt1->p2" or regex capturing groups (src, tgt) earlier
                    # If regex captured comma separated values e.g. "p1,t1"
                    pairs = extracted_text.splitlines()
                    for pair in pairs:
                        parts = pair.replace('->', ',').split(',')
                        if len(parts) >= 2:
                            src = parts[0].strip()
                            tgt = parts[1].strip()
                            # Resolve IDs
                            src_id = next((p['id'] for p in result['places'] if p['label'] == src), None)
                            tgt_id = next((t['id'] for t in result['transitions'] if t['label'] == tgt), None)
                            if src_id is not None and tgt_id is not None:
                                result['arcs'].append({"sourceId": src_id, "targetId": tgt_id, "type": "place_to_transition", "weight": 1})
                            else:
                                src_id = next((t['id'] for t in result['transitions'] if t['label'] == src), None)
                                tgt_id = next((p['id'] for p in result['places'] if p['label'] == tgt), None)
                                if src_id is not None and tgt_id is not None:
                                    result['arcs'].append({"sourceId": src_id, "targetId": tgt_id, "type": "transition_to_place", "weight": 1})

            elif target == 'marking':
                tokens = []
                if transform == 'split_comma_int':
                    tokens = [int(t.strip()) for t in extracted_text.split(',') if t.strip().isdigit()]
                elif transform == 'split_space_int':
                    tokens = [int(t.strip()) for t in extracted_text.split() if t.strip().isdigit()]
                
                for i, t_val in enumerate(tokens):
                    if i < len(result['places']):
                        result['places'][i]['tokens'] = t_val

        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
