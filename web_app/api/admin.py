from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash
from web_app.data import database as db

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/users', methods=['GET'])
@login_required
def list_users():
    """Admin: List all users."""
    if not current_user.can_manage():
        return jsonify({'error': 'Unauthorized'}), 403
    
    users = db.get_all_users()
    return jsonify(users)

@admin_bp.route('/users', methods=['POST'])
@login_required
def add_user():
    """Admin: Add a new user."""
    if not current_user.can_manage():
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'user')
    
    if not username or not password:
        return jsonify({'error': 'Missing fields'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
        
    pwhash = generate_password_hash(password)
    
    success = db.create_user(username, pwhash, role)
    if not success:
        return jsonify({'error': 'Username exists'}), 400
        
    return jsonify({'status': 'success'})

@admin_bp.route('/users/<int:user_id>/block', methods=['POST'])
@login_required
def block_user(user_id):
    """Admin: Block/Unblock a user."""
    if not current_user.can_manage():
        return jsonify({'error': 'Unauthorized'}), 403
    
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot block yourself'}), 400

    data = request.json
    block_status = data.get('block', True)
    
    db.update_user_block_status(user_id, block_status)
    
    return jsonify({'status': 'success'})

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    """Admin: Delete a user."""
    if not current_user.can_manage():
        return jsonify({'error': 'Unauthorized'}), 403

    if user_id == current_user.id:
        return jsonify({'error': 'Cannot delete yourself'}), 400
        
    db.delete_user(user_id)
    
    return jsonify({'status': 'success'})

@admin_bp.route('/password', methods=['POST'])
@login_required
def change_password():
    """User: Change own password."""
    data = request.json
    new_password = data.get('password')
    
    if not new_password:
        return jsonify({'error': 'Missing password'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
        
    pwhash = generate_password_hash(new_password)
    
    db.update_user_password(current_user.id, pwhash)
    
    return jsonify({'status': 'success'})
