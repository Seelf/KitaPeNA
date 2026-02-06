"""
Implementation of the algorithm for generating all maximal independent sets (MIS).
Based on the paper:
"On Generating All Maximal Independent Sets",
David S. Johnson, Mihalis Yannakakis, Christos H. Papadimitriou.
Information Processing Letters, Vol 27, 1988.

The algorithm (pseudocode) uses a priority queue to generate
independent sets in lexicographical order, guaranteeing polynomial delay
between successively generated sets.
"""

import networkx as nx
import matplotlib.pyplot as plt
import heapq
import time

def get_lex_first_mis(G, nodes, prefix=None):
    """
    Finds the lexicographically first maximal independent set (MIS) 
    containing the given prefix.
    
    Args:
        G (nx.Graph): Input graph.
        nodes (list): Sorted list of graph nodes.
        prefix (set, optional): Set of vertices that must be included in the MIS.
    
    Returns:
        list: The lexicographically first MIS containing the prefix, as a sorted list.
    """
    if prefix is None:
        prefix = set()
    mis = set(prefix)
    
    # Greedily search vertices in ascending (lexicographical) order.
    for v in nodes:
        # If v is not already in mis...
        if v not in mis:
            # Add v to the set only if none of its neighbors 
            # have been added to mis previously.
            if all(neighbor not in mis for neighbor in G.neighbors(v)):
                mis.add(v)
    return sorted(list(mis))

def is_maximal_in_subset(G, mis_subset, nodes_subset):
    """
    Checks if a given set (mis_subset) is a maximal independent set
    with respect to a subset of vertices (nodes_subset).
    
    By definition, an independent set S is maximal in G' if every vertex
    in G' not belonging to S has at least one neighbor in S.
    """
    # Check every vertex from the considered subset (e.g., {1, ..., j})
    for v in nodes_subset:
        if v not in mis_subset:
            # If v is not in the set, it must have a neighbor in the set.
            # If it has no neighbor in mis_subset, the set is not maximal 
            # (because we could add v).
            if all(neighbor not in mis_subset for neighbor in G.neighbors(v) if neighbor in nodes_subset):
                return False
    return True

def visualize_step(G, pos, current_mis, title, wait_for_user=False):
    """
    Helper function to visualize algorithm steps.
    Draws the graph with vertices belonging to the current MIS highlighted.
    """
    plt.clf()
    # MIS vertices in red, others in blue
    colors = ['#FF4B4B' if node in current_mis else '#1E90FF' for node in G.nodes()]
    nx.draw(G, pos, with_labels=True, node_color=colors, node_size=800, font_weight='bold', edge_color='gray')
    
    if wait_for_user:
        plt.title(title + "\n(Press any key or click to continue)")
        plt.waitforbuttonpress()
    else:
        plt.title(title)
        plt.pause(1.5) # Short pause for animation effect

def run_mis_algorithm(edges, n, manual_mode=False):
    """
    Main loop of the Johnson, Yannakakis, and Papadimitriou algorithm.
    
    Generates and outputs all maximal independent sets for a graph defined by edges.
    Uses a priority queue Q to store found sets and process them
    in lexicographical order.
    """
    G = nx.Graph()
    G.add_edges_from(edges)
    nodes = sorted(list(G.nodes()))
    pos = nx.spring_layout(G)
    
    plt.ion() # Enable interactive mode for animation
    
    Q = [] # Priority queue storing tuples (MIS). Tuples are compared lexicographically.
    seen = set() # Set to track already discovered MISs to avoid duplicates in the queue.
    
    # STEP 1: Find the lexicographically first MIS (S*) for the entire graph.
    s_star = tuple(get_lex_first_mis(G, nodes))
    heapq.heappush(Q, s_star)
    seen.add(s_star)

    print(f"Starting MIS generation...")

    while Q:
        # STEP 2: Pop the minimum (lexicographically first) set S from queue Q.
        S_tuple = heapq.heappop(Q)
        S = set(S_tuple)
        
        # Output/visualize the result
        output_msg = f"Found MIS: {sorted(list(S))}"
        print(output_msg)
        visualize_step(G, pos, S, output_msg, wait_for_user=manual_mode)

        # STEP 3: For each vertex j, check the possibility of generating a new candidate.
        # Iterate over all vertices in the graph.
        for j in nodes:
            # Condition from the paper: vertex j must be 'reversible' in the context of S.
            # We look for j such that j does not belong to S, but has neighbors in S with indices smaller than j.
            # (In Python implementation, we simply check adjacency and order relation).
            
            # Check if j has a neighbor in S which is "older" (has smaller index/value).
            if any(neighbor in S and neighbor < j for neighbor in G.neighbors(j)):
                
                nodes_upto_j = [v for v in nodes if v <= j]
                
                # Define Sj as intersection of S and set {1, ..., j}.
                S_j = {v for v in S if v <= j}
                
                # STEP 4: Create a candidate prefix for a new set.
                # Formula: (S_j \ Gamma(j)) U {j}
                # Meaning: take part of S up to j, remove neighbors of j, and add j itself.
                # This forces j to be in the new independent set.
                candidate_prefix = (S_j - set(G.neighbors(j))) | {j}
                
                # STEP 5: Maximality test.
                # Check if such prefix is a maximal independent set
                # within the subgraph induced by {1, ..., j}.
                if is_maximal_in_subset(G, candidate_prefix, nodes_upto_j):
                    
                    # STEP 6: Extend prefix to a full MIS in the entire graph G.
                    # We take the lexicographically first MIS containing our candidate_prefix.
                    T = tuple(get_lex_first_mis(G, nodes, prefix=candidate_prefix))
                    
                    # If we found a new, not yet visited set T, add it to the queue.
                    if T not in seen:
                        heapq.heappush(Q, T)
                        seen.add(T)
    
    plt.ioff()
    plt.show()

if __name__ == "__main__":
    # --- TEST GRAPH DEFINITION ---
    # Cycle C5 (Pentagon). Expected result: 5 independent sets.
    edges_data = [(1, 2), (2, 3), (3, 4), (4, 5), (5, 1)]
    # Enable manual_mode=True to pause after each step
    run_mis_algorithm(edges_data, 5, manual_mode=True)