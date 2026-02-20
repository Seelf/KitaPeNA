import sys
import os
import multiprocessing
from flask import Flask, render_template, request, jsonify

# Ensure we can import mis_core from the parent directory
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from web_app.extensions_setup import csrf, limiter, login_manager
from web_app.config import Config
from web_app.data import database as db
from flask_login import login_required, current_user

# Blueprints
from web_app.auth import auth_bp
from web_app.api.admin import admin_bp
from web_app.api.algorithms import algos_bp
from web_app.api.graphs import graphs_bp
from web_app.api.petri.routes import petri_bp
from web_app.api.petri.analysis import petri_analysis_bp
from web_app.api.analysis import analysis_bp
from web_app.api.solve import solve_bp
from web_app.api.benchmark import benchmark_bp

app = Flask(__name__)
app.config.from_object(Config)

# Initialize Extensions
csrf.init_app(app)
limiter.init_app(app)
login_manager.init_app(app)

# Initialize DB
db.init_db()

# Register Blueprints
app.register_blueprint(auth_bp) # /login, /logout
app.register_blueprint(admin_bp, url_prefix='/api/admin')
app.register_blueprint(algos_bp, url_prefix='/api/algorithms')
app.register_blueprint(graphs_bp, url_prefix='/api/graphs')
app.register_blueprint(petri_bp, url_prefix='/api/petri') # /api/petri/saved, /import, etc.
app.register_blueprint(petri_analysis_bp, url_prefix='/api/petri') # /api/petri/reachability, /concurrency
app.register_blueprint(analysis_bp, url_prefix='/api/analysis') # /api/analysis/transitivity, /coloring
app.register_blueprint(solve_bp, url_prefix='/api/solve')
app.register_blueprint(benchmark_bp, url_prefix='/api/benchmark')

@app.errorhandler(429)
def ratelimit_handler(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Rate limit exceeded', 'message': e.description}), 429
    return render_template('429.html', description=e.description), 429

@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    if os.environ.get('FLASK_ENV') == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

@app.route('/')
@login_required
def index():
    """Renders the main application page."""
    return render_template('index.html', user=current_user)

if __name__ == '__main__':
    # Fix for multiprocessing on some platforms
    multiprocessing.set_start_method('spawn', force=True)
    
    port = int(os.environ.get('PORT', 5002))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    print(f"Server running on http://localhost:{port} (debug={debug})")
    app.run(debug=debug, port=port)
