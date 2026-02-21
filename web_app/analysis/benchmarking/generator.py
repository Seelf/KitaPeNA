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

def generate_atlas_graphs(upper_limit):
    """
    Generates all graphs from NetworkX graph atlas that have from 1 to `upper_limit` vertices.
    Used for exhaustive testing of algorithms up to 7 vertices.
    """
    res = []
    # graph_atlas_g is a generator of 1253 graphs with up to 7 nodes
    for idx, G in enumerate(nx.graph_atlas_g()):
        n = len(G.nodes())
        if 1 <= n <= upper_limit:
            nodes = [{"id": i, "label": f"n{i}"} for i in G.nodes()]
            edges = [[u, v] for u, v in G.edges()]
            res.append({'id': f"atlas_{idx}", 'name': f"Atlas Graphs #{idx} (V={n}, E={len(edges)})", 'nodes': nodes, 'edges': edges})
    return res
