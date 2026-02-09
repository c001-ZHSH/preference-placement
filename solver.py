import networkx as nx
import pandas as pd

class DistributionSolver:
    def __init__(self, df, id_col, choice_cols, capacities, use_priority=True):
        """
        Initialize the solver.
        
        Args:
            df (pd.DataFrame): Input dataframe with student data.
            id_col (str): Column name for student ID/Name.
            choice_cols (list): List of column names representing choices.
            capacities (dict): Dictionary mapping route names to their capacity limits.
            use_priority (bool): If True, use exponential costs to prioritize choices. If False, use equal costs.
        """
        self.df = df
        self.id_col = id_col
        self.choice_cols = choice_cols
        self.capacities = capacities
        self.use_priority = use_priority # New flag
        
        self.graph = nx.DiGraph()
        self.source = "SOURCE_NODE"
        self.sink = "SINK_NODE"
        
    def build_graph(self):
        """Builder the flow network graph with Costs for MinCostMaxFlow."""
        self.graph.clear()
        
        # Add Source and Sink
        self.graph.add_node(self.source)
        self.graph.add_node(self.sink)
        
        # Add Route nodes using capacity
        for route, cap in self.capacities.items():
            if cap > 0:
                # Route -> Sink: Cap=Limit, Cost=0
                self.graph.add_edge(route, self.sink, capacity=int(cap), weight=0)
                
        # Add Student nodes
        for idx, row in self.df.iterrows():
            student_id = str(row[self.id_col])
            node_student = f"student_{idx}" 
            
            # Source -> Student: Cap=1, Cost=0
            # weight=0 means we don't penalize for trying to match a student,
            # but we will likely gain negative cost or just minimal cost on match edges.
            # In NX min_cost_max_flow, we want to minimize Total Cost.
            # We assign Cost based on Preference Rank: Choice 1 = 1, Choice 2 = 10...
            self.graph.add_edge(self.source, node_student, capacity=1, weight=0)
            
            # Edges: Student -> Route with Priority Cost
            # choice_cols are ordered: Choice 1, Choice 2, ...
            seen_routes = set()
            for rank, col in enumerate(self.choice_cols):
                val = row[col]
                if pd.notna(val) and str(val).strip() != "":
                    choice = str(val).strip()
                    if choice in self.capacities and choice not in seen_routes:
                        # Cost Calculation:
                        # If use_priority is True: Exponential cost (1, 100, 10000...)
                        # If use_priority is False: Constant cost (1) - effectively equal preference
                        
                        if self.use_priority:
                            # Rank 0 (Choice 1) -> Cost 1
                            # Rank 1 (Choice 2) -> Cost 100
                            # Rank 2 (Choice 3) -> Cost 10000
                            # This ensures we always prefer a Rank 0 match over any number of Rank 1 matches?
                            # Actually simpler: 1, 2, 3 works if we just want "Better average rank".
                            # But user specified: "Run Intention 1 First". This implies Lexicographic preference.
                            # Cost = 100^rank ensures strict hierarchy.
                            cost = 100 ** rank 
                        else:
                            cost = 1
                        
                        self.graph.add_edge(node_student, choice, capacity=1, weight=cost)
                        seen_routes.add(choice)

    def solve(self):
        """
        Run Min Cost Max Flow algorithm to respect preferences.
        """
        self.build_graph()
        
        # Calculate Min Cost Max Flow
        # capacity='capacity', weight='weight'
        # Note: Even for unranked, we can use min_cost_max_flow with equal weights.
        # It's cleaner than switching algorithms. Equal weights means any match is as good as another.
        flow_dict = nx.max_flow_min_cost(self.graph, self.source, self.sink)
        
        matched_results = []
        matched_indices = set()
        
        # Parse flow
        for idx in range(len(self.df)):
            node_student = f"student_{idx}"
            if node_student in flow_dict:
                student_flow = flow_dict[node_student]
                matched_route = None
                for target, flow in student_flow.items():
                    if flow > 0 and target != self.source:
                        matched_route = target
                        break
                
                real_student_id = self.df.iloc[idx][self.id_col]
                if matched_route:
                    # Find rank for info (optional)
                    rank_info = "Unknown"
                    for r, col in enumerate(self.choice_cols):
                        val = self.df.iloc[idx][col]
                        if str(val).strip() == matched_route:
                            rank_info = f"Choice {r+1}"
                            break
                            
                    matched_results.append({
                        "Student": real_student_id,
                        "Matched_Route": matched_route,
                        "Rank": rank_info
                    })
                    matched_indices.add(idx)
        
        unmatched_students = []
        for idx in range(len(self.df)):
            if idx not in matched_indices:
                real_student_id = self.df.iloc[idx][self.id_col]
                unmatched_students.append(real_student_id)
                
        results_df = pd.DataFrame(matched_results)
        
        stats = {
            "total_students": len(self.df),
            "total_matched": len(matched_results),
            "total_unmatched": len(unmatched_students),
            "match_rate": len(matched_results) / len(self.df) if len(self.df) > 0 else 0
        }
        
        return results_df, unmatched_students, stats

    def get_route_usage(self, flow_dict=None):
        """Calculate usage per route based on current capacities or flow result."""
        # Recalculate if flow not provided
        if not flow_dict:
             _, flow_dict = nx.maximum_flow(self.graph, self.source, self.sink)
             
        usage = {}
        for route in self.capacities:
            # Flow from Route to Sink
            if route in flow_dict:
                 # The flow going TO the Sink from Route
                 # which is flow_dict[route][self.sink]
                 if self.sink in flow_dict[route]:
                     usage[route] = flow_dict[route][self.sink]
                 else:
                     usage[route] = 0
            else:
                usage[route] = 0
        return usage
