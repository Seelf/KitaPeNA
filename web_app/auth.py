from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import UserMixin, login_user, logout_user, current_user, login_required
from werkzeug.security import check_password_hash
import requests

from web_app.extensions_setup import login_manager, limiter
from web_app.data import database as db
from web_app.config import Config

auth_bp = Blueprint('auth', __name__)

class User(UserMixin):
    def __init__(self, id, username, role, is_blocked):
        self.id = id
        self.username = username
        self.role = role
        self.is_blocked = is_blocked
    
    @property
    def is_active(self):
        return not self.is_blocked
    
    def can_manage(self):
        return self.role == 'admin'

@login_manager.user_loader
def load_user(user_id):
    user = db.get_user_by_id(user_id)
    if user:
        return User(user['id'], user['username'], user['role'], user['is_blocked'])
    return None

@auth_bp.route('/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute") 
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        cf_token = request.form.get('cf-turnstile-response')
        
        if Config.TURNSTILE_SECRET_KEY:
            try:
                verify_payload = {
                    'secret': Config.TURNSTILE_SECRET_KEY,
                    'response': cf_token,
                    'remoteip': request.remote_addr
                }
                verify_response = requests.post(Config.TURNSTILE_VERIFY_URL, data=verify_payload).json()
                if not verify_response.get('success', False):
                     flash("CAPTCHA verification failed. Please try again.", "danger")
                     return render_template('login.html', site_key=Config.TURNSTILE_SITE_KEY)
            except Exception as e:
                print(f"Turnstile Error: {e}")
                flash("Security check failed.", "danger")
                return render_template('login.html', site_key=Config.TURNSTILE_SITE_KEY)

        user_row = db.get_user_by_username(username)
        
        if user_row:
             if check_password_hash(user_row['password_hash'], password):
                 if user_row['is_blocked']:
                     flash("Account is blocked.", "danger")
                     return render_template('login.html', site_key=Config.TURNSTILE_SITE_KEY)
                 
                 user_obj = User(user_row['id'], user_row['username'], user_row['role'], user_row['is_blocked'])
                 login_user(user_obj)
                 return redirect(url_for('index'))
        
        flash("Invalid credentials.", "danger")

    return render_template('login.html', site_key=Config.TURNSTILE_SITE_KEY)

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))
