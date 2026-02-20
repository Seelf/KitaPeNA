import sys
import os
import json

# Add current directory to sys.path to find the compiled module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

# Try importing the compiled module
try:
    # Build artifact usually ends up in build/lib... or current dir if inplace
    import mis_cpp
except ImportError:
    mis_cpp = None
    print("Warning: 'mis_cpp' module not found. Did you run 'python setup.py build_ext --inplace'?")

class CppAdapter:
    @staticmethod
    def is_available():
        return mis_cpp is not None

    @staticmethod
    def solve(nodes, edges):
        """
        Calls the C++ solver.
        Input: Python lists of nodes/edges.
        Output: Result dict from C++.
        """
        if not mis_cpp:
            return {"success": False, "error": "C++ Module not loaded"}

        # Pass Python objects directly (Pybind11 handles conversion)
        return mis_cpp.solve(nodes, edges)

    @staticmethod
    def solve_dsatur(nodes, edges):
        if not mis_cpp:
            return {"success": False, "error": "C++ Module not loaded"}
        return mis_cpp.solve_dsatur(nodes, edges)
