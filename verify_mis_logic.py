import sys
import unittest
from unittest.mock import MagicMock
import networkx as nx

# Mock matplotlib to prevent UI windows from popping up
sys.modules['matplotlib'] = MagicMock()
sys.modules['matplotlib.pyplot'] = MagicMock()

# Import the module to be tested
import MIS

class TestMISAlgorithm(unittest.TestCase):
    def test_c5_cycle(self):
        """Test MIS generation for a 5-cycle (Pentagon)."""
        edges = [(1, 2), (2, 3), (3, 4), (4, 5), (5, 1)]
        expected_mis_count = 5 
        # C5 maximal independent sets correspond to picking any pair of non-adjacent vertices.
        # Since it's a 5-cycle, every pair of non-adjacent vertices is a MIS.
        # Pairs: {1,3}, {1,4}, {2,4}, {2,5}, {3,5}. Total 5.
        
        found_mis_list = []

        # Intercept visualize_step to capture results
        def mock_visualize_step(G, pos, current_mis, title):
            # Store a copy of the set, sorted tuple for comparison
            found_mis_list.append(tuple(sorted(list(current_mis))))

        # Replace the real visualizer with our mock
        original_visualizer = MIS.visualize_step
        MIS.visualize_step = mock_visualize_step
        
        try:
            # Run the algorithm
            MIS.run_mis_algorithm(edges, 5)
        finally:
            # Restore just in case (though process ends anyway)
            MIS.visualize_step = original_visualizer

        # Verify results
        unique_mis = set(found_mis_list)
        print(f"\nZnaleziono {len(unique_mis)} unikalnych MIS: {sorted(list(unique_mis))}")
        
        self.assertEqual(len(unique_mis), expected_mis_count, f"Oczekiwano {expected_mis_count} zbiorów, znaleziono {len(unique_mis)}")
        
        expected_sets = {
            (1, 3), (1, 4), (2, 4), (2, 5), (3, 5)
        }
        self.assertEqual(unique_mis, expected_sets, "Znalezione zbiory nie zgadzają się z oczekiwanymi dla C5.")

if __name__ == '__main__':
    unittest.main()
