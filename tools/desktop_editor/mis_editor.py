"""
Interactive Graph Editor and Controller.
Single Window Interface using GridSpec.
Dark Mode (VS Code Style).
"""

import matplotlib.pyplot as plt
from matplotlib.widgets import Button, RadioButtons
import matplotlib.gridspec as gridspec
import networkx as nx
import math
import textwrap

# Import our custom modules
import mis_core
import mis_viz

class GraphEditor:
    def __init__(self):
        self.G = nx.Graph()
        self.pos = {} # Stores fixed positions of nodes
        self.selected_node = None # For creating edges
        
        # --- LAYOUT SETUP (Dark Mode) ---
        # Force global dark mode settings
        plt.style.use('dark_background')
        plt.rcParams['toolbar'] = 'None' # Hide the bottom toolbar
        
        # VS Code Colors
        self.colors = {
            'bg': '#1e1e1e',          # Main Window BG
            'panel_bg': '#252526',    # Sidebar/Panel BG
            'input_bg': '#3c3c3c',    # Button/Input BG
            'fg': '#cccccc',          # Text Color
            'accent': '#007acc',      # Status Bar Blue
            'border': '#3e3e42',      # Borders
            'graph_bg': '#1e1e1e',    # Graph workspace
            'highlight': '#ffffff'    # Selected text highlight
        }
        
        # Explicitly set params again to be sure
        plt.rcParams['figure.facecolor'] = self.colors['bg']
        plt.rcParams['axes.facecolor'] = self.colors['graph_bg']
        plt.rcParams['savefig.facecolor'] = self.colors['bg']
        plt.rcParams['text.color'] = self.colors['fg']
        plt.rcParams['axes.labelcolor'] = self.colors['fg']
        plt.rcParams['xtick.color'] = self.colors['fg']
        plt.rcParams['ytick.color'] = self.colors['fg']
        
        self.fig = plt.figure(figsize=(14, 9))
        # self.fig.patch.set_facecolor(self.colors['bg']) # Handled by rcParams but keep for safety
        self.fig.set_facecolor(self.colors['bg'])
        
        if hasattr(self.fig.canvas, 'manager') and self.fig.canvas.manager:
            self.fig.canvas.manager.set_window_title('MIS Algorithm - Interactive Editor (Dark Mode)')

        # Grid: 3 rows (Main, Controls, Status)
        # Row 0: Graph (80%) | Results (20%) - Height 0.85
        # Row 1: Controls - Height 0.10
        # Row 2: Status Bar - Height 0.05
        gs = self.fig.add_gridspec(3, 2, height_ratios=[0.85, 0.10, 0.05], width_ratios=[0.75, 0.25],
                                  left=0.02, right=0.98, top=0.98, bottom=0.02, wspace=0.1, hspace=0.1)
        
        # 1. Main Graph Panel (Top Left)
        self.ax = self.fig.add_subplot(gs[0, 0])
        self.ax.set_facecolor(self.colors['graph_bg'])
        self.ax.set_xticks([])
        self.ax.set_yticks([])
        # Spines will be set in update_plot to ensure visibility

        # 2. Results Panel (Top Right)
        self.ax_results = self.fig.add_subplot(gs[0, 1])
        self.ax_results.set_facecolor(self.colors['panel_bg'])
        self.ax_results.set_xticks([])
        self.ax_results.set_yticks([])
        # Title color logic
        self.ax_results.set_title("Found MIS Sets", fontsize=10, fontweight='bold', color=self.colors['fg'], pad=10)
        self.results_text = self.ax_results.text(0.05, 0.95, "", ha='left', va='top', 
                                                fontsize=9, fontfamily='monospace', color=self.colors['fg'],
                                                transform=self.ax_results.transAxes)

        # 3. Controls Placeholder (Middle Row)
        # Just empty space for buttons

        # 4. Status Bar (Bottom Row - Full Width)
        self.ax_status = self.fig.add_subplot(gs[2, :])
        self.ax_status.set_facecolor(self.colors['accent'])
        self.ax_status.set_xticks([])
        self.ax_status.set_yticks([])
        
        self.status_text = self.ax_status.text(0.01, 0.5, "Ready", 
                                              ha='left', va='center', fontsize=11, color='white', fontweight='bold')

        
        # State parameters
        self.algorithm_generator = None
        self.is_simulating = False
        self.current_mis = []
        self.found_results = [] 
        self.auto_playing = False
        
        # For scrollable list
        self.list_scroll_y = 0.0
        self.mis_text_artists = {} # artist -> mis_index
        
        # --- CONTROLS IMPLEMENTATION ---
        
        # Mode Selection (Bottom Left, Row 1 area)
        # Coordinates need to be guessed relative to figure 0..1
        # Row 1 is approx from y=0.07 to y=0.17
        
        ax_radio = self.fig.add_axes([0.05, 0.08, 0.12, 0.08], facecolor=self.colors['panel_bg'])
        self.radio = RadioButtons(ax_radio, ('Add Nodes', 'Add Edges'), active=0, 
                                  activecolor=self.colors['accent'])
        # Style radio buttons text
        for label in self.radio.labels:
            label.set_color(self.colors['fg'])
            
        self.mode = 'Add Nodes'
        self.radio.on_clicked(self.set_mode)
        
        # Buttons Setup
        def make_btn(rect, label, callback, color=None):
            if color is None: color = self.colors['input_bg']
            ax = self.fig.add_axes(rect)
            btn = Button(ax, label, color=color, hovercolor='#505050')
            btn.label.set_color(self.colors['fg'])
            btn.on_clicked(callback)
            return btn
        
        # Horizontal layout for buttons
        y_pos = 0.09
        h = 0.06
        w = 0.08
        spacing = 0.01
        start_x = 0.22
        
        self.btn_start = make_btn([start_x, y_pos, w, h], 'Start\nReset', self.btn_start_reset_clicked, '#388e3c') # Greenish
        self.btn_next  = make_btn([start_x + (w+spacing)*1, y_pos, w, h], 'Next Step', self.btn_next_clicked)
        self.btn_auto  = make_btn([start_x + (w+spacing)*2, y_pos, w, h], 'Auto Play', self.btn_auto_clicked)
        self.btn_run   = make_btn([start_x + (w+spacing)*3, y_pos, w, h], 'Run All', self.btn_run_all_clicked)
        self.btn_clear = make_btn([start_x + (w+spacing)*5, y_pos, w, h], 'Clear\nGraph', self.btn_clear_clicked, '#d32f2f') # Reddish
        
        # Connect main canvas event handlers
        self.cid_click = self.fig.canvas.mpl_connect('button_press_event', self.on_click)
        self.fig.canvas.mpl_connect('close_event', self.on_close)
        self.fig.canvas.mpl_connect('scroll_event', self.on_scroll)
        self.fig.canvas.mpl_connect('pick_event', self.on_pick)

        # Timer
        self.timer = self.fig.canvas.new_timer(interval=1000)
        self.timer.add_callback(self.on_timer_tick)
        
        self.update_plot("Edit Mode: Draw your graph")

    def on_close(self, event):
        """Clean up resources."""
        if self.timer:
            try:
                self.timer.remove_callback(self.on_timer_tick)
                self.timer.stop()
            except Exception:
                pass
            self.timer = None
        self.auto_playing = False

    def on_scroll(self, event):
        if event.inaxes == self.ax_results:
            step = 0.1 # scroll step
            if event.button == 'up':
                self.list_scroll_y += step
            elif event.button == 'down':
                self.list_scroll_y -= step
            
            # Clamp scroll top
            if self.list_scroll_y > 0: self.list_scroll_y = 0
            
            self.update_results_panel()
            self.fig.canvas.draw_idle()

    def on_pick(self, event):
        if event.artist in self.mis_text_artists:
            mis_index = self.mis_text_artists[event.artist]
            if 0 <= mis_index < len(self.found_results):
                self.current_mis = self.found_results[mis_index]
                self.update_plot(f"Highlighted MIS #{mis_index+1}")

    def set_mode(self, label):
        self.mode = label
        self.selected_node = None
        self.update_plot(f"Mode changed to: {label}")

    def update_results_panel(self):
        """Update the right panel with interactive list of found MIS sets."""
        # Clear existing text objects
        self.ax_results.clear()
        self.ax_results.set_title("Found MIS Sets", fontsize=10, fontweight='bold', color=self.colors['fg'], pad=10)
        self.ax_results.set_xticks([])
        self.ax_results.set_yticks([])
        
        if not self.found_results:
             self.ax_results.text(0.05, 0.95, "(None)", ha='left', va='top', 
                                  fontsize=9, fontfamily='monospace', color=self.colors['fg'],
                                  transform=self.ax_results.transAxes)
             return

        self.mis_text_artists = {}
        
        # Start drawing from top (y=1.0) shifted by scroll
        # Note: We are using data coords approx. Let's fix axes lims to 0..1 for easiness
        self.ax_results.set_xlim(0, 1)
        self.ax_results.set_ylim(0, 1)
        
        current_y = 1.0 + self.list_scroll_y - 0.05 # Initial padding
        line_height = 0.04 # Height per text item approx
        
        for i, res in enumerate(self.found_results):
            # Sort and Format
            res_str = str(sorted(list(res)))
            label = f"{i+1}. {res_str}"
            
            # Wrap text to fit panel width approx
            # Assuming char width... let's say 25 chars max
            wrapped_lines = textwrap.wrap(label, width=22)
            
            is_selected = (res == self.current_mis)
            color = self.colors['highlight'] if is_selected else self.colors['fg']
            weight = 'bold' if is_selected else 'normal'

            for line in wrapped_lines:
                # Don't draw if outside view (Optimization)
                if current_y < -0.05:
                    break 
                
                if current_y > 1.05:
                     current_y -= line_height
                     continue

                text_obj = self.ax_results.text(0.05, current_y, line, 
                                               ha='left', va='top', 
                                               fontsize=9, fontfamily='monospace', 
                                               color=color, fontweight=weight,
                                               picker=True) # Enable picking
                
                # Store mapping artist -> index
                self.mis_text_artists[text_obj] = i
                
                current_y -= line_height
            
            current_y -= 0.015 # Extra spacing between items

    def update_plot(self, status_msg=None):
        # 1. Update Status Bar
        if status_msg:
            # Truncate to fit
            MAX_LEN = 120
            if len(status_msg) > MAX_LEN:
                status_msg = status_msg[:MAX_LEN] + "..."
            self.status_text.set_text(status_msg)
        
        # 2. Draw Graph (Center)
        highlighted = list(self.current_mis)
        mis_viz.draw_graph(self.G, self.pos, highlighted_nodes=highlighted, ax=self.ax, title="")
        
        # Visual Styles for Graph Area
        self.ax.set_axis_on()
        self.ax.set_xticks([])
        self.ax.set_yticks([])
        
        # Spines (Border) - VS Code border color
        for spine in self.ax.spines.values():
            spine.set_visible(True)
            spine.set_linewidth(1.5)
            spine.set_edgecolor(self.colors['accent']) # Blue border for active feel? Or gray?
            # User asked for "like VS Code", maybe just standard border
            spine.set_edgecolor(self.colors['border']) # Dark Gray

        # Visual differentiation: Focus Border (if simulating, maybe make it blue?)
        if self.is_simulating:
             for spine in self.ax.spines.values():
                spine.set_edgecolor(self.colors['accent'])
                spine.set_linewidth(2)
        
        # Enforce fixed coordinate system
        self.ax.set_xlim(0, 10)
        self.ax.set_ylim(0, 10)
        
        # Highlight selection
        if self.selected_node is not None and self.selected_node in self.pos:
            x, y = self.pos[self.selected_node]
            # Yellow halo might be too bright. Let's use white or lighter accent.
            self.ax.plot(x, y, 'o', color='white', markersize=24, alpha=0.3, zorder=-1)

        # 3. Update Results
        self.update_results_panel()

        self.fig.canvas.draw_idle()

    def get_clicked_node(self, x, y, threshold=0.4):
        for node, (nx, ny) in self.pos.items():
            dist = math.sqrt((x - nx)**2 + (y - ny)**2)
            if dist < threshold:
                return node
        return None

    def on_click(self, event):
        # Only handle interactions in the Graph Axes
        if event.inaxes != self.ax:
            return
            
        if self.is_simulating:
            if not self.auto_playing:
                self.advance_simulation()
            return

        x, y = event.xdata, event.ydata
        clicked_node = self.get_clicked_node(x, y)

        if self.mode == 'Add Nodes':
            if clicked_node is None:
                new_node = 1 if not self.G.nodes() else max(self.G.nodes()) + 1
                self.G.add_node(new_node)
                self.pos[new_node] = (x, y)
                self.update_plot("Node added")
                
        elif self.mode == 'Add Edges':
            if clicked_node is None:
                if self.selected_node is not None:
                    self.selected_node = None
                    self.update_plot("Deselected.")
            else:
                if self.selected_node is None:
                    self.selected_node = clicked_node
                    self.update_plot(f"Node {clicked_node} selected. Click others to connect.")
                else:
                    if self.selected_node == clicked_node:
                        self.selected_node = None
                        self.update_plot("Deselected.")
                    else:
                        u, v = self.selected_node, clicked_node
                        if self.G.has_edge(u, v):
                            self.G.remove_edge(u, v)
                            msg = "Edge removed"
                        else:
                            self.G.add_edge(u, v)
                            msg = "Edge added"
                        self.update_plot(msg + f" (Node {self.selected_node} active)")

    # --- BUTTON CALLBACKS ---

    def btn_start_reset_clicked(self, event):
        if self.is_simulating:
            self.stop_simulation()
        else:
            self.start_simulation()

    def btn_next_clicked(self, event):
        if not self.is_simulating:
            self.start_simulation()
        else:
            self.advance_simulation()

    def btn_auto_clicked(self, event):
        if not self.is_simulating:
            self.start_simulation()
        
        self.auto_playing = not self.auto_playing
        if self.auto_playing:
            self.timer.start()
            self.update_plot("Auto Play Started...")
        else:
            self.timer.stop()
            self.update_plot("Auto Play Paused.")

    def btn_run_all_clicked(self, event):
        if not self.is_simulating:
            self.start_simulation()
        
        # Fast forward
        count = 0
        limit = 1000
        while self.is_simulating and count < limit:
            self.advance_simulation()
            count += 1
            if not self.algorithm_generator:
                break

    def btn_clear_clicked(self, event):
        self.stop_simulation()
        self.G.clear()
        self.pos.clear()
        self.selected_node = None
        self.found_results = []
        self.update_plot("Graph cleared.")
    
    # --- SIMULATION LOGIC ---

    def stop_simulation(self):
        self.is_simulating = False
        self.auto_playing = False
        if self.timer: self.timer.stop()
        self.algorithm_generator = None
        self.current_mis = []
        self.update_plot("Simulation Stopped. Edit Mode.")

    def start_simulation(self):
        if not self.G.nodes():
            self.update_plot("Graph is empty!")
            return
            
        self.is_simulating = True
        self.selected_node = None
        self.algorithm_generator = mis_core.mis_algorithm_generator(self.G)
        self.current_mis = []
        self.found_results = []
        self.update_plot("Sim Started.")

    def on_timer_tick(self):
        if self.is_simulating and self.auto_playing:
            self.advance_simulation()
            if not self.is_simulating:
                if self.timer: self.timer.stop()
                self.auto_playing = False

    def advance_simulation(self):
        if not self.is_simulating or not self.algorithm_generator:
            return

        try:
            mis_data = next(self.algorithm_generator)
            self.current_mis, status_msg = mis_data
            self.found_results.append(self.current_mis)
            count = len(self.found_results)
            self.update_plot(f"Step {count}: Found {self.current_mis}")
        except StopIteration:
            total = len(self.found_results)
            self.update_plot(f"Finished! Total MIS: {total}")
            self.algorithm_generator = None
            self.auto_playing = False
            if self.timer: self.timer.stop()

    def show(self):
        plt.show()
