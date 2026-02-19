"""
Core logic for the Maximal Independent Sets (MIS) generation algorithm.
Based on Johnson, Yannakakis, Papadimitriou (1988).
Pure algorithmic logic without visualization dependencies.
"""

import networkx as nx
import heapq

def get_lex_first_mis(G, nodes, prefix=None):
    """Finds the lexicographically first MIS containing the prefix."""
    if prefix is None:
        prefix = set()
    mis = set(prefix)
    
    # Greedy search in ascending order
    for v in nodes:
        if v not in mis:
            if all(neighbor not in mis for neighbor in G.neighbors(v)):
                mis.add(v)
    return sorted(list(mis))

def is_maximal_in_subset(G, mis_subset, nodes_subset):
    """Checks if a set is maximal within a subset of vertices."""
    for v in nodes_subset:
        if v not in mis_subset:
            # Must have a neighbor in the set to be maximal
            if all(neighbor not in mis_subset for neighbor in G.neighbors(v) if neighbor in nodes_subset):
                return False
    return True

def mis_algorithm_generator(G):
    """
    Generator yielding maximal independent sets step-by-step.
    Yields: (current_mis_list, status_message)
    """
    nodes = sorted(list(G.nodes()))
    
    Q = [] # Priority queue
    seen = set()
    
    # STEP 1: Find first MIS
    s_star = tuple(get_lex_first_mis(G, nodes))
    heapq.heappush(Q, s_star)
    seen.add(s_star)

    while Q:
        # STEP 2: Pop minimum set
        S_tuple = heapq.heappop(Q)
        S = set(S_tuple)
        
        yield sorted(list(S)), f"Found MIS: {sorted(list(S))}"

        # STEP 3: Generate candidates
        for j in nodes:
            # Reversibility condition
            if any(neighbor in S and neighbor < j for neighbor in G.neighbors(j)):
                
                nodes_upto_j = [v for v in nodes if v <= j]
                S_j = {v for v in S if v <= j}
                
                # STEP 4: Candidate prefix
                candidate_prefix = (S_j - set(G.neighbors(j))) | {j}
                
                # STEP 5: Maximality test
                if is_maximal_in_subset(G, candidate_prefix, nodes_upto_j):
                    
                    # STEP 6: Extend to full MIS
                    T = tuple(get_lex_first_mis(G, nodes, prefix=candidate_prefix))
                    
                    if T not in seen:
                        heapq.heappush(Q, T)
                        seen.add(T)
