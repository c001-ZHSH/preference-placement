import pandas as pd
from solver import DistributionSolver
import unittest

class TestSolver(unittest.TestCase):
    def test_max_flow_simple(self):
        # Data: 3 Students
        # S1 wants A
        # S2 wants A, B
        # S3 wants B
        data = {
            "ID": ["S1", "S2", "S3"],
            "Choice1": ["RouteA", "RouteA", "RouteB"],
            "Choice2": [None, "RouteB", None] 
        }
        df = pd.DataFrame(data)
        
        # Capacities: A=1, B=1. Total cap=2. Total demand=3.
        # Max flow should be 2. (e.g. S1->A, S3->B. S2 unmatched. OR S2->A, S3->B. OR S1->A, S2->B)
        capacities = {"RouteA": 1, "RouteB": 1}
        
        solver = DistributionSolver(df, "ID", ["Choice1", "Choice2"], capacities)
        results, unmatched, stats = solver.solve()
        
        print("\nTest Results:")
        print(results)
        print("Unmatched:", unmatched)
        print("Stats:", stats)
        
        self.assertEqual(stats["total_matched"], 2)
        self.assertEqual(stats["total_unmatched"], 1)

if __name__ == "__main__":
    unittest.main()
