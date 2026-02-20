# KitaPeNA

A web application supporting research on **Concurrent Systems** modeled using **Petri Nets**.

The project is used for:
1.  **Edition and Visualization** of Petri Nets (Places, Transitions, Arcs).
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

## Architecture and Evaluation Pipelining

### 1. System Metadata
*   **System Name:** KitaPeNA
*   **Version:** 1.0.0 (Prototype phase)
*   **License:** MIT / GPL
*   **Repository:** [Specific research repository / GitHub]

### 2. Functional Overview
**Problem Statement:** Modern research on algorithms for discrete structures, graph theory, and optimization often encounters a fundamental organizational and technological barrier: the lack of standardized, deterministic evaluation mechanisms independent of hardware platforms and local toolchains. The traditional process of testing algorithms implemented in compiled languages (like C++) requires researchers to build custom shell scripts, instrument source code, and manually manage system metrics. This approach introduces an operational overhead that is difficult to quantify, deviations related to operating system specifics, and most importantly, radically limits the reproducibility of results by independent research groups.

The "KitaPeNA" application mitigates this phenomenon by providing a unified, fully web-based benchmarking wrapper. The system automates rigorous I/O mapping procedures and build processes, relieving researchers from the necessity of writing analytical apparatus and enforcing high methodological rigor around the code itself.

### 3. Core Architecture Diagram Description
The project is implemented as a multi-tier system, decomposing flows into disjoint domains and reducing the phenomena of overlapping transmission delays.

*   **Presentation Layer:** Based entirely on the *Single Page Application* (SPA) paradigm implemented using Vanilla JS. The reduced dependency on heavy reactive frameworks ensures minimal framework lifecycle overhead. For advanced representation of topological models on the visual side, a hardware-accelerated GUI *Canvas API* is used, allowing smooth processing of thousands of edges without overloading the main browser thread.
*   **API Layer (Routing Core):** The central server operates on the Flask micro-framework in a *RESTful* convention. Access abstraction is organized in an architecture of isolated sub-resources using the **Flask Blueprints** mechanism. The use of Blueprints strictly decomposes services (e.g., separating disk operations from measurement engine operations), introducing logical code isolation, deterministic extensibility, and simplified authorization supervision of individual router domains.
*   **Integration Layer (Interoperability Layer):** The most crucial module of the system, acting as a bridge between the Python management environment and C++ execution units. Two bridging libraries interact in a hybrid manner here:
    *   **`ctypes`**: Provides absolutely the flattest and lowest-overhead interface for native types directly linked to the C-ABI (Application Binary Interface).
    *   **`pybind11`**: Used for more complex container representations and parsing C++ object structures, masking the need for manual allocation of object pointers for standard libraries (e.g., `std::vector`), which allows integrating higher-order code without sacrificing extreme processor performance.

### 4. The Benchmarking Pipeline
The logical core of the application manages an asynchronous statistical evaluation pipeline, which can be broken down into the following execution stages during an on-demand execution:

1.  **C++ Code Upload:** The system receives the C++ code payload from the web wrapper in encrypted POST packets into the temporary preprocessor environment (temp virtualization).
2.  **On-the-fly Compilation:** The context automatically launches the system compiler (e.g., `clang++`). The process is obligatorily equipped with the necessary flags: level 3 optimization (`-O3`), position-independent code generation (`-fPIC`), and targeting the production of shared objects for dynamic linking (`-shared`).
3.  **Shared Object Initialization:** The created `.so` shells (`.dll` for Windows OS) are loaded directly into the host memory area of the Python virtual machine using descriptors in `ctypes.CDLL()`.
4.  **Memory Pointer Resolving:** Pointer compatibility is ensured for dynamic casts from Python to C – including the allocation of reference arrays for large graphs using vector casting instructions like `POINTER(c_int)`.
5.  **Time Measurements & Execution:** The measurement block is executed using deterministic, kernel-resolution timers (`time.perf_counter_ns()` or `time.perf_counter()`) to eliminate errors from CPU time fluctuations at higher OS layers, guaranteeing the sharpest real-time estimate of CPU occupancy for the algorithm itself.
6.  **Capture Output:** Data sent through traditional descriptors (`std::cout`, stream operations, or C error outputs) is intercepted by a dynamic wrapper (`CaptureOutput` class manipulating system IO streams) and loaded back into test buffers in Python memory, completing the loop.

### 5. Technical Innovations in the Wrapper
The implementation of the tool introduces rigorous modernizations compared to ad-hoc scripts:
*   **On-the-fly Compilation Automation:** The researcher modifies the code in the browser-based IDE and runs tests without any interaction with CMake, Makefiles, or the target machine architecture issues, forcing the compilation and linking cycle implicitly on the application server side.
*   **Overhead Mitigation & Statistical Averaging:** The application preventively applies mechanisms to counteract the influence of OS jitter and context switching. Algorithms are often invoked in an initial warm-up phase to saturate the L1/L2 cache before making the key reading, after which the predefined repetition loop is executed. The final results undergo averaging to publication standards with standard deviation for scientific metrics.
*   **Low-level File Descriptor Homing:** The problem of extracting output streams from a compiled language without refactoring the source code of the entrusted algorithm. The environment uses POSIX interface tools (`pipe` and stream pointer replacement operations such as `stdout` macros via the C system `dup` and `dup2` commands). The innovation lies in redirecting the streams straight to the safe evaluator layer without losing the stability of the main engine.

### 6. Impact and Reproducibility
Thanks to the architecture of the "KitaPeNA" application presented above, reproducibility of scientific research in the field of algorithm design gains a drastically lower threshold of difficulty. Standardizing the loading mechanism makes it easier for other digital laboratories to perform rigorous re-verification and counter-offensive comparisons of algorithms (e.g., Maximum Independent Set solutions), as all stakeholders base their estimators on the same operating environment, identified memory buffer, and identical hardware pointer parser. Investing in the web-compilation architecture allows the scientist to completely eliminate research effort spent on building the execution time profiling apparatus, providing a ready-made artifact for scientific reviewers and publications in contemporary computational research.

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

4.  **More Import and Export file extensions for Petri nets**.

---

## Authors
*   **Dawid Konarczak** - *Lead Developer & Researcher* - ORCID: https://orcid.org/0009-0008-8239-1426

## Citation
If you use KitaPeNA in your research, please cite it using the generated Zenodo DOI. Once published, you can use the following BibTeX entry:

```bibtex
@software{kitapena_2026,
  author       = {Dawid Konarczak},
  title        = {KitaPeNA: A Web-based Petri nets suite},
  year         = {2026},
  publisher    = {Zenodo},
  doi          = {10.5281/zenodo.XXXXXXX},
  url          = {https://doi.org/10.5281/zenodo.XXXXXXX}
}
```

## License
This project is licensed under the [MIT License](LICENSE) - see the `LICENSE` file for details.

## Disclaimer
Parts of this application and its documentation were generated or assisted by AI models.
