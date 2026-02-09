import networkx as nx
try:
    print(f"Has max_flow_min_cost: {hasattr(nx, 'max_flow_min_cost')}")
    print(f"Has min_cost_flow: {hasattr(nx, 'min_cost_flow')}")
    from networkx.algorithms.flow import max_flow_min_cost
    print("Can import max_flow_min_cost")
except Exception as e:
    print(e)
