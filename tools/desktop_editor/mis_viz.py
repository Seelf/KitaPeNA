"""
Visualization module for MIS algorithm.
Responsible for drawing graphs using matplotlib.
"""

import networkx as nx
import matplotlib.pyplot as plt

def draw_graph(G, pos, highlighted_nodes=None, ax=None, title=""):
    """
    Draws the graph on the specified axes.
    
    Args:
        G (nx.Graph): The graph to draw.
        pos (dict): Node positions layout.
        highlighted_nodes (list/set): Nodes to highlight (e.g., current MIS).
        ax (matplotlib.axes.Axes): The axes to draw on.
        title (str): Plot title.
    """
    if ax is None:
        ax = plt.gca()
        
    ax.clear()
    
    if highlighted_nodes is None:
        highlighted_nodes = set()
    else:
        highlighted_nodes = set(highlighted_nodes)
        
    # Color coding: Red for MIS nodes, Blue for others
    node_colors = ['#FF4B4B' if node in highlighted_nodes else '#1E90FF' for node in G.nodes()]
    
    nx.draw(G, pos, 
            ax=ax,
            with_labels=True, 
            node_color=node_colors, 
            node_size=800, 
            font_weight='bold', 
            edge_color='#dcdcdc')
    
    ax.set_title(title)
