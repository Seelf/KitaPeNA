import random
import networkx as nx

def generate_random_graph(num_nodes, density):
    """
    Generates a random graph (Erdos-Renyi model).
    Returns basic node/edge lists compatible with the app.
    """
    # Use NetworkX for robust generation
    # density is prob of edge creation, 0.0 to 1.0
    G = nx.erdos_renyi_graph(n=num_nodes, p=density)
    
    nodes = [{"id": i, "label": f"n{i}"} for i in G.nodes()]
    edges = [[u, v] for u, v in G.edges()]
    
    return nodes, edges

def generate_clique(num_nodes):
    G = nx.complete_graph(num_nodes)
    nodes = [{"id": i, "label": f"n{i}"} for i in G.nodes()]
    edges = [[u, v] for u, v in G.edges()]
    return nodes, edges
