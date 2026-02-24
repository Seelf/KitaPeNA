from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from web_app.data import database as db

explorer_bp = Blueprint('explorer', __name__)

@explorer_bp.route('/state', methods=['GET'])
@login_required
def get_explorer_state():
    """Returns the saved explorer state for the current user."""
    state = db.get_explorer_state(current_user.id)
    return jsonify(state or {})

@explorer_bp.route('/state', methods=['PUT'])
@login_required
def save_explorer_state():
    """Saves the explorer state for the current user."""
    state = request.json
    if not state:
        return jsonify({'error': 'No state provided'}), 400
    db.save_explorer_state(current_user.id, state)
    return jsonify({'status': 'ok'})
