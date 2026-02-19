# MC MIS Research Web App

A web application supporting research on **Concurrent Systems** modeled using **Petri Nets**.

The project is used for:
1.  **Edytion and Visualization** of Petri Nets (Places, Transitions, Arcs).
2.  **Generating Reachability Graphs** - the state space of the system.
3.  **Generating Concurrency Graphs** based on event independence relations.
4.  **Structural Graph Analysis**:
    *   Determining MIS (Maximum Independent Sets).
    *   Graph Coloring (Exact and Heuristic Algorithms).
    *   Verification of Transitive Orientability (TRO).
5.  **Benchmarking** performance of graph algorithms.

---

## Running the Project

### Requirements
*   Python 3.8+
*   Web Browser (Chrome / Firefox / Edge)

### Installation and Start

1.  **Environment Preparation (One-time):**
    ```bash
    # Create virtual environment
    python3 -m venv .venv
    
    # Activate environment
    # macOS/Linux:
    source .venv/bin/activate
    # Windows:
    # .venv\Scripts\activate
    
    # Install dependencies
    pip install -r requirements.txt
    ```

2.  **Starting the Server:**
    ```bash
    python web_app/app.py
    ```
    The application will be available at: [http://127.0.0.1:5002](http://127.0.0.1:5002)

---

## Key Features

### 1. Interactive Petri Net Editor
*   "Drag & Drop" network creation.
*   Support for places, transitions, arcs (weights), and initial marking (tokens).
*   Import and export of nets in the following formats:
    *   **PNH**.
    *   **PNML** (Petri Net Markup Language - XML standard).
    *   **JSON**.

### 2. Database Explorer
*   Browsing saved nets with **Infinite Scroll**.
*   Advanced filtering (by number of places, transitions, arcs, tokens).
*   Sorting by name, creation date, or network parameters.
*   Management of saved models (opening, deleting, downloading).

### 3. Graph Analysis
*   **Reachability Graph**: Automatic generation of the full state space with node and edge visualization.
*   **Concurrency Graph**: Analysis of concurrency relations, checking if the graph is a cograph or permutation graph.
*   **Coloring**: Visualization of independence classes (DSatur + Backtracking algorithm).

### 4. Benchmarking Module
*   Performance testing of algorithms (Python / C++) on graph sets.
*   Testing modes:
    *   Random Graphs.
    *   Saved Graphs from DB.
    *   Graphs generated from saved Petri Nets.
*   Multiprocessing support.

---

## Project Structure

The project is divided into backend logic (Flask) and modular frontend (Vanilla JS + ES6 Modules).

```text
/
├── web_app/
│   ├── app.py                 # Main entry point (Flask server)
│   ├── api/                   # REST API Endpoints (Blueprints)
│   │   ├── admin.py           # Admin tools
│   │   ├── algorithms.py      # Algorithm access
│   │   ├── benchmark.py       # Benchmark module API
│   │   ├── graphs.py          # Graph operations
│   │   └── petri/             # Petri Net operations (import/export/save)
│   │
│   ├── analysis/              # Business logic and algorithms
│   │   ├── reachability.py    # Reachability graph generation
│   │   ├── concurrency.py     # Concurrency analysis
│   │   └── benchmarking/      # Performance test runner
│   │
│   ├── data/                  # Data access layer (SQLite)
│   ├── static/js/             # Modular JS client
│   │   ├── core/              # Core mechanisms (Main, State, Storage, Tabs)
│   │   ├── domain/            # Domain logic (Petri, Algo, Concurrency)
│   │   ├── engine/            # Rendering and interaction engines (Canvas, Layout)
│   │   └── ui/                # UI Handling (DatabaseExplorer, UI Manager)
│   │
│   └── templates/             # HTML Templates (SPA)
│
├── tools/                     # Helper tools and legacy code
└── tests/                     # Unit tests
```

---

## Roadmap

The project is actively developed. Upcoming plans include:

1.  **Tool wrappers like i.e. GSPN Wrapper (Generalized Stochastic Petri Nets)**:
    *   Embedding support for GSPN to access analysis time (for comparing purposes) and challenge it against other software.
    *   Embedding support for HippoCPS.
    *   Embedding support for PIPE (cmd version).
    *   Embedding support for MS algorithm (but now can be implemented in C manually by user - so this is a maybe).
    *   Add universal embeddings for other tools (or create tool specific embeddings).
    *   Main goal is to have a "Big Laboratory" in one single browser page to evaluate analysis times of as many tools as possible and to create reports of evaluation times of different algorithms/tools in one single place without need to access every tool one by one. Bulk evaluation and verification of answers (future works include adding visual comparing tool of i.e. outputs of each particular algorithm so that scientist can see which algorithm failed for example to evaluate liveness of the Petri net).

2.  **Wrapper Extension**:
    *   Adding support for other programming languages in the computation layer (Currently C/C++ is confirmed working but in future Rust, Python, Java etc. support is planned to be added).
    *   Integration with external solvers (API for other online tools and API FROM them).

3.  **Advanced Results Export**:
    *   Ability to export research, simulation, and benchmark results to analytical formats (CSV, Excel etc.).
    *   Generating automatic reports with charts and summary tables (latex, docx etc.).
