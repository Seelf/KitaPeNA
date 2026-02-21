import os
import re
import subprocess
from flask import Blueprint, jsonify, request
from flask_login import login_required

algos_bp = Blueprint('algorithms', __name__)

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CUSTOM_ALGOS_DIR = os.path.join(base_dir, 'web_app', 'analysis', 'custom_algos')
if not os.path.exists(CUSTOM_ALGOS_DIR):
    os.makedirs(CUSTOM_ALGOS_DIR)

@algos_bp.route('', methods=['GET'])
@login_required
def list_algorithms():
    """List all custom C++ algorithms."""
    algos = []
    if os.path.exists(CUSTOM_ALGOS_DIR):
        for f in os.listdir(CUSTOM_ALGOS_DIR):
            if f.endswith('.cpp'):
                name = f[:-4]
                compiled = os.path.exists(os.path.join(CUSTOM_ALGOS_DIR, f"{name}.so"))
                algos.append({'name': name, 'compiled': compiled})
    return jsonify(algos)

@algos_bp.route('/<name>', methods=['GET'])
@login_required
def get_algorithm_source(name):
    """Get the source code of a specific algorithm."""
    path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.cpp")
    if not os.path.exists(path):
        return jsonify({'error': 'Algorithm not found'}), 404
    try:
        with open(path, 'r') as f:
            code = f.read()
        return jsonify({'name': name, 'code': code})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@algos_bp.route('', methods=['POST'])
@login_required
def save_algorithm():
    """Save and Compile a C++ algorithm."""
    data = request.json
    name = data.get('name')
    code = data.get('code')
    
    if not name or not code:
        return jsonify({'error': 'Name and code are required'}), 400
    
    # Sanitize name
    if not re.match(r'^\w+$', name):
        return jsonify({'error': 'Invalid name. Use alphanumeric and underscores only.'}), 400

    cpp_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.cpp")
    so_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.so")
    wrapped_cpp_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}_wrapped.cpp")
    
    try:
        # 1. Save Original Code
        with open(cpp_path, 'w') as f:
            f.write(code)
            
        # 2. Generator Wrapper Code
        has_solve = bool(re.search(r'\bsolve\s*\(', code))
        has_solve_petri = bool(re.search(r'\bsolve_petri\s*\(', code))
        
        wrapper_code = f"""#include <chrono>

#define solve user_solve
#define solve_petri user_solve_petri

// --- USER CODE START ---
{code}
// --- USER CODE END ---

#undef solve
#undef solve_petri

extern "C" {{
"""
        if has_solve:
            wrapper_code += """
    double solve(int n, int m, int* u, int* v, int* colors) {
        auto __start_time = std::chrono::high_resolution_clock::now();
        user_solve(n, m, u, v, colors);
        auto __end_time = std::chrono::high_resolution_clock::now();
        return std::chrono::duration<double, std::milli>(__end_time - __start_time).count();
    }
"""
        if has_solve_petri:
            wrapper_code += """
    double solve_petri(const char* pnh_path) {
        auto __start_time = std::chrono::high_resolution_clock::now();
        user_solve_petri(pnh_path);
        auto __end_time = std::chrono::high_resolution_clock::now();
        return std::chrono::duration<double, std::milli>(__end_time - __start_time).count();
    }
"""
        wrapper_code += "}\n"
        
        with open(wrapped_cpp_path, 'w') as f:
            f.write(wrapper_code)

        # 3. Compile the wrapped code
        cmd = [
            'clang++', 
            '-shared', '-fPIC', '-O3', 
            '-undefined', 'dynamic_lookup', 
            '-o', so_path, 
            wrapped_cpp_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # 4. Clean up the wrapped code
        if os.path.exists(wrapped_cpp_path):
            os.remove(wrapped_cpp_path)
            
        if result.returncode != 0:
            # Clean up the .so file if it failed previously but created something (unlikely, but safe)
            if os.path.exists(so_path): os.remove(so_path)
            return jsonify({
                'success': False, 
                'message': 'Compilation Failed', 
                'stderr': result.stderr
            }), 400
            
        return jsonify({'success': True, 'message': 'Saved and Compiled successfully.'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@algos_bp.route('/<name>', methods=['DELETE'])
@login_required
def delete_algorithm(name):
    """Delete a custom algorithm."""
    if not re.match(r'^\w+$', name):
        return jsonify({'error': 'Invalid name'}), 400
        
    cpp_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.cpp")
    so_path = os.path.join(CUSTOM_ALGOS_DIR, f"{name}.so")
    
    try:
        if os.path.exists(cpp_path): os.remove(cpp_path)
        if os.path.exists(so_path): os.remove(so_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
