"""
Core logic for the Maximal Independent Sets (MIS) generation algorithm.
Based on Johnson, Yannakakis, Papadimitriou (1988).

This module contains pure algorithmic logic with NO dependency on visualization libraries.
It uses a generator pattern to yield results step-by-step.
"""

import networkx as nx
import heapq

def get_lex_first_mis(G, nodes, prefix=None):
    """
    Finds the lexicographically first maximal independent set (MIS) 
    containing the given prefix.
    """
    if prefix is None:
        prefix = set()
    mis = set(prefix)
    
    # Greedily search vertices in ascending (lexicographical) order.
    for v in nodes:
        if v not in mis:
            # Add v if none of its neighbors are in mis
            if all(neighbor not in mis for neighbor in G.neighbors(v)):
                mis.add(v)
    return sorted(list(mis))

def is_maximal_in_subset(G, mis_subset, nodes_subset):
    """
    Checks if a given set is a maximal independent set with respect to a subset of vertices.
    """
    for v in nodes_subset:
        if v not in mis_subset:
            # Must have a neighbor in the set to be maximal
            if all(neighbor not in mis_subset for neighbor in G.neighbors(v) if neighbor in nodes_subset):
                return False
    return True

def mis_algorithm_generator(G):
    """
    Generator yielding maximal independent sets step-by-step.
    
    Args:
        G (nx.Graph): Input graph.
        
    Yields:
        tuple: (current_mis_list, status_message)
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
        
        # Yield the result to the caller
        yield sorted(list(S)), f"Found MIS: {sorted(list(S))}"

        # STEP 3: Generate candidates
        for j in nodes:
            # Check reversibility condition
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
