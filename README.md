# KitaPeNA [![DOI](https://zenodo.org/badge/1162573243.svg)](https://doi.org/10.5281/zenodo.18712856)

<img src="https://github.com/user-attachments/assets/383e9fc1-5020-4783-8e01-16e6b9613bfa" alt="Widok głównego interfejsu aplikacji KitaPeNA - edytor sieci Petriego" width="1509" height="811">

A web application supporting research on **Concurrent Systems** modeled using **Petri Nets**.

The project is used for:
1.  **Edition and Visualization** of Petri Nets (Places, Transitions, Arcs).
2.  **Generating Reachability Graphs** - the state space of the system.
3.  **Generating Concurrency Graphs** based on event independence relations.
4.  **Structural Graph Analysis**:
    *   Determining MIS (Maximum Independent Sets).
    *   Graph Coloring (Exact and Heuristic Algorithms).
    *   Verification of Transitive Orientability (Comparability Graph Analysis).
5.  **Benchmarking Module**:
    *   Performance evaluation of graph algorithms and Petri net analysis tools.
    *   Multi-statistical analysis (Mean, Median, P95, Min, Max).
    *   Support for exhaustive testing on NetworkX Atlas datasets.
    *   Integration with external solvers like DSPN-Tool (GSPN support).
6.  **User Management**:
    *   Secure Authentication system with CSRF protection and Rate Limiting.
    *   Persistent user sessions and saved configurations.

---

## 1. Changelog

### v1.1.0 (Latest)
*   **Core Benchmarking Engine**:
    *   **Scientific Metrics Extraction**: Integrated a **Regex-based extraction engine** to capture data (states, firing rates, etc.) directly from algorithm console output.
    *   **Custom CLI (CMD) Scripts**: Added support for external binary tools with dynamic argument templates (placeholders like `{pnh}`, `{gspn}`, `{id}`).
    *   **Multi-Statistical Analysis**: Simultaneous support for **Mean, Median, Min, Max, and P95** aggregations with independent Chart.js visualizations.
    *   **NetworkX Atlas Integration**: Support for exhaustive benchmarking on all 1,253 isomorphic small graphs up to $N=7$.
    *   **Precision Timing**: High-precision CPU timing utilizing `perf_counter_ns` and POSIX `dup2` output redirection for isolated C++ measurement.
*   **Data Management & Discovery**:
    *   **Universal Parser Builder (Experimental)**: New UI-based tool for creating custom importers for non-standard Petri net formats using rule-based (Regex/Line Range) logic.
    *   **Advanced Data Filtering**: Introduced multi-row structural property filters (P, T, A, K) with comparison operators and persistent filter states per user.
    *   **Search Engine**: Added deep metadata searching and **Regex search** support in both Database Explorer and Benchmark selection menus.
    *   **Research Portability**: Implemented full **JSON Export/Import** for CLI scripts, Regex parsers, and Universal Parser templates to facilitate sharing research setups.
*   **Infrastructure & Security**:
    *   **PostgreSQL Migration**: Switched to PostgreSQL for robust data persistence, user isolation, and multi-tenant performance.
    *   **Secure Authentication**: Implemented a comprehensive login system featuring Flask-Login, CSRF protection via Flask-WTF, and API Rate Limiting to prevent brute-force attacks.
    *   **Dockerization**: Production-ready `Dockerfile` and `docker-compose.yml` for instant, hardware-independent deployments.
*   **User Interface & UX**:
    *   **Architecture Refactoring**: Complete modularization of the frontend into clean ES6 modules (`core`, `domain`, `engine`, `ui`).
    *   **Responsive Dashboard**: Improved layout and dynamic menus for managing large sets of Petri nets and graphs.
    *   **Version Tracking**: Added a subtle, interactive version indicator (v1.1.0) on the login screen for better environment identification.
    *   **Visual Indicators**: Added badges for active filters and benchmark progress status.

---

## 2. Running the Project

### Requirements
*   Python 3.8+ (for local setup) or **Docker**
*   Web Browser (Chrome / Firefox / Edge)

### Quick Start (Docker)

The fastest way to run KitaPeNA without configuring C++ compilers and Python environments locally is using Docker.

Just run this single command in the project root directory:

```bash
docker-compose up -d --build
```
The application will automatically build the environment and be available at: [http://127.0.0.1:5002](http://127.0.0.1:5002)

*(Any saved Petri nets or graphs will be persisted automatically using Docker volumes).*

---

### Manual Installation (Local)

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

## 3. Key Features

### 3.1. Interactive Petri Net Editor
*   "Drag & Drop" network creation.
*   Support for places, transitions, arcs (weights), and initial marking (tokens).
*   Import and export of nets in the following formats:
    *   **PNH**.
    *   **PNML** (Petri Net Markup Language - XML standard).
    *   **JSON**.

<img src="https://github.com/user-attachments/assets/383e9fc1-5020-4783-8e01-16e6b9613bfa" alt="Widok głównego interfejsu aplikacji KitaPeNA - edytor sieci Petriego" width="1509" height="811">

### 3.2. Database Explorer
*   Browsing saved nets with **Infinite Scroll**.
*   Advanced filtering (by number of places, transitions, arcs, tokens).
*   Sorting by name, creation date, or network parameters.
*   Management of saved models (opening, deleting, downloading).

<img width="1510" height="812" alt="Image" src="https://github.com/user-attachments/assets/1857b7a5-de48-4929-bb8c-a9e60a705da2" />

### 3.3. Graph Analysis
*   **Reachability Graph**: Automatic generation of the full state space with node and edge visualization.
*   **Concurrency Graph**: Analysis of concurrency relations, checking if the graph is a cograph or permutation graph.
*   **Coloring**: Visualization of independence classes (DSatur + Backtracking algorithm).

<img width="1511" height="811" alt="Image" src="https://github.com/user-attachments/assets/e3000e7a-2df8-4676-b692-239320906851" />

https://github.com/user-attachments/assets/df31a479-f963-488b-8335-6a2f3a1f8000

<img width="1507" height="810" alt="Image" src="https://github.com/user-attachments/assets/a56d1514-67ee-4217-993e-986557518e9c" />

### 3.4. Benchmarking Module
*   Performance testing of algorithms (Python / C++) on graph sets.
*   Testing modes:
    *   Random Graphs.
    *   Saved Graphs from DB.
    *   Graphs generated from saved Petri Nets.
*   Multiprocessing support.

<img width="1508" height="811" alt="Image" src="https://github.com/user-attachments/assets/4e6300fa-afff-4711-af10-7fef01b3aaef" />

<img width="1512" height="848" alt="Image" src="https://github.com/user-attachments/assets/44ec38f2-c0da-4ac5-8eaf-548101a2e360" />

---

## 4. Data Discovery & Advanced Filtering

KitaPeNA addresses the challenge of managing large-scale research datasets through a unified filtering engine available in both the **Database Explorer** and the **Benchmarking** selection window.

### 4.1. Structural Property Filters
Researchers can isolate models based on their topological signature using dynamic, multi-row property filters.
*   **Metrics**: Filter by number of **Places (P)**, **Transitions (T)**, **Arcs (A)**, and **Initial Tokens (K)**.
*   **Logical Operators**: Support for comparison operators ($\ge$, $\le$, $=$).
*   **Stackable Rules**: You can apply multiple rules simultaneously (e.g., "Find all nets where $P \ge 50$ AND $A \le 200$").

### 4.2. Metadata & Regex Search
Beyond structural metrics, the system supports deep content discovery:
*   **Graph Class**: Filter models by their logical classification or research project tag.
*   **Metadata Full-Text**: Search across all extended net metadata.
*   **Regex Engine**: Full **Regular Expression** support for metadata fields, allowing users to find specific structural notations or authorship patterns.

### 4.3. Filtering in the Benchmarking Module
The benchmarking pipeline includes a dedicated **Selection Filter Modal**. This ensures that performance tests are run only on relevant data subsets:
*   **Live Preview Stats**: Each item in the selection list displays a summary badge (e.g., `[ P:12 | T:15 | Class:Manufacturing ]`) for immediate verification.
*   **Bulk Selection**: Advanced filters automatically update the selection list, allowing for one-click "Select All Matching" operations.
*   **Dataset Scenarios**: Easily create test scenarios like "Algorithm performance on all Nets with more than 10 transitions".

### 4.4. Intelligence & Persistence
*   **Persistent Filter State**: Your filter configurations are saved to the backend automatically. When you return to the explorer or the benchmark window, your complex filter setups are restored.
*   **Active Indicator**: A toolbar badge tracks the number of active filters, ensuring you always know if you are viewing a filtered subset of the database.

---

## 5. Benchmarking Engine & Scientific Evaluation

The core of KitaPeNA is a specialized benchmarking engine designed for rigorous scientific evaluation of algorithms. Unlike traditional testing scripts, the engine provides a controlled, isolated, and deterministic environment for performance measurement.

### 5.1. High-Precision Timing & Isolation
The engine utilizes a **Precision Timing Architecture** that minimizes measurement noise:
*   **Kernel-Level Timers**: Uses `perf_counter_ns` to achieve nanosecond resolution, essential for sub-millisecond algorithm iterations.
*   **Warm-up Phases**: To mitigate JIT (if applicable) and OS cache effects, the system supports (and automatically performs in tight loops) multiple iterations where only stabilized readings are aggregated.
*   **Output Redirection**: Utilizing POSIX `dup2` at the file descriptor level, the engine captures *all* output sent to `stdout` and `stderr` by compiled C++ binaries without requiring any modifications to the original source code.

### 5.2. The Regex Extraction System (Scientific Metrics)
A unique feature of the wrapper is its ability to turn unstructured console output into structured scientific data:
*   **Multi-Stage Parsing**: Users can define Regex patterns in the UI. The engine applies these patterns to the captured logs post-execution.
*   **Dynamic Data Tables**: Extracted values (e.g., "Number of States", "Firing Rate", "Iteration Count", "Memory Usage") are automatically injected into a dynamic results table.
*   **Table Orchestration & Export**: You can toggle column visibility per algorithm and context (N, Graph ID, etc.), creating publication-ready summary tables instantly. Tables can be exported directly to **CSV** and **LaTeX** formats with a single click.

### 5.3. Statistical Aggregations
KitaPeNA v1.1.0 supports simultaneous multi-aggregation analysis. For every test batch, the engine calculates:
*   **Mean & Median**: Standard performance indicators.
*   **Min & Max**: Identifying the best and worst-case scenarios in randomized sets.
*   **P95 (95th Percentile)**: Critical for analyzing tail latency and stability of heuristic algorithms.
Each aggregation spawns its own independent, interactive Chart.js visualization.

### 5.4. Specialized Data Sources
*   **NetworkX Atlas**: Integrated exhaustive set of 1,253 graphs containing all non-isomorphic graphs up to 7 nodes. This allows for **Exact Exhaustive Verification** of algorithm correctness and performance trends on small, dense datasets.
*   **Petri Net Bridges**: Automatic generation of **Reachability Graphs** (full state space) and **Concurrency Graphs** (event independence relations) which are then fed into the graph-testing pipeline.
*   **DSPN-Tool Integration**: Support for GreatSPN's Generalized Stochastic Petri Nets solver, allowing researchers to challenge custom C++ logic against established industrial-grade solvers.

### 5.5. Extensibility & Portability (CMD Scripts & Sharing)
KitaPeNA is designed as an open ecosystem where research tools can be easily integrated and shared:
*   **Custom CLI (CMD) Scripts**: Beyond C++ code, you can register any external command-line executable. 
*   **Dynamic Argument Templates**: Use placeholders such as `{pnh}` (path to model), `{gspn}` (GreatSPN format), `{id}` (database ID), and `{name}` (model name) to automatically construct command strings for each test case.
*   **The "Shareable Research" Architecture**: A core design principle of v1.1.0 is the **JSON-based Portability** of research configurations. You can **Export and Import** the following entities:
    *   **Custom CLI Scripts**: Full command configurations.
    *   **Regex Metric Parsers**: Scientific extraction rules.
    *   **Universal Parser Templates**: Rules for importing non-standard Petri net files.
    *   **C++ Algorithm Templates**: (Coming soon) Portable algorithm drafts.

This allows for the creation of standardized "Research Bundles" that can be distributed alongside publications to ensure 100% reproducibility.

---

## 6. Universal Parser Builder (Experimental)

**⚠️ Work In Progress (WIP):** This feature is currently in an early experimental stage. While functional in its core logic, it requires significant development and testing before it can be considered stable or comprehensive.

The **Universal Parser Builder** is a specialized tool designed to handle the "Wild West" of Petri net file formats. Researchers often encounter models described in unstructured text or non-standard proprietary formats. Instead of writing a new Python importer for every file, you can build a **Custom Parser** directly in the UI:

### 6.1. Rule-Based Extraction
*   **Methodologies**: Define rules based on **Regular Expressions** (with full flag support) or **Line Ranges**.
*   **Target Fields**: Maps extracted data to core model components: `Places`, `Transitions`, `Arcs`, `Marking`, and `Metadata`.
*   **Data Transformation**: Built-in transformers to clean extracted strings:
    *   `split_comma_int` / `split_space_int`: For ID lists.
    *   `arc_pairs`: To correctly pair source and target nodes from arc definitions.
    *   `join_newline`: For multi-line metadata extraction.

### 6.2. Live Extraction Sandbox
The builder includes a side-by-side **Live Preview** window. As you draft your rules and paste sample text, the engine provides real-time feedback on the extracted model's structure, ensuring your rules are accurate before saving them to the database.

### 6.3. Portability
Parsers are stored in the user's database but can be **exported/imported as JSON**. This allows research teams to share custom parsing rules for specific datasets.

---

## 7. User Context & State Persistence

To ensure a seamless research workflow, KitaPeNA features an **Automatic State Persistence** system. The application tracks and saves your UI configuration to the PostgreSQL database, isolated per user account. This eliminates the need to re-configure complex test environments during every session.

### 7.1. Database Explorer Persistence
The system remembers your exact "discovery" context:
*   **Search Queries & Sort Orders**: Most recent search string and sorting preference (by name, date, or complexity).
*   **Advanced Filter Sets**: All active structural property filters ($\ge$, $\le$, $=$) and their values.
*   **Metadata Visibility**: Regex search strings and full-text metadata filters.
*   **View Preferences**: Whether you were viewing Petri nets or Graphs, and the current pagination state.

### 7.2. Benchmarking Configuration Persistence
The Benchmarking module features a deep state save to maintain complex evaluation suites:
*   **Algorithm Selections**: All checked system engines and custom C++ scripts.
*   **Dataset Selections**: Specific lists of IDs for Petri nets and Graphs chosen for the last run.
*   **Execution Parameters**: Iteration counts, statistical aggregation methods (Mean, P95, etc.), and timeout settings.
*   **Custom CLI Mappings**: Configuration of external tool paths and argument templates.
*   **Regex Metric Selections**: Which regex parsers were active for data extraction.

This persistence ensures that researchers can "pick up where they left off" across different machines or sessions, maintaining the integrity of the experimental setup.

---

## 8. Usage Guide (Benchmarking Pipeline)

To effectively use KitaPeNA for your research and algorithm evaluation, follow this standard workflow:

1.  **Model Creation / Import:** Use the **Petri Net Editor** to draw your concurrent system model or import an existing one using supported formats (e.g., PNH, JSON).
2.  **Save to Database:** Save your Petri net to the built-in database to make it available for future tests and analysis.
3.  **State Space Generation:** Switch to the Analysis tools to generate the Reachability Graph and the Concurrency Graph representing your system.
4.  **Algorithm Implementation:** If you are testing your own C++ solutions (e.g., for Graph Coloring), navigate to the Algorithm management section to draft your C++ code.
5.  **Benchmarking Execution:** Go to the **Benchmarking** module:
    *   Select your data source (saved graphs from the database or randomly generated ones).
    *   Select the algorithms to be evaluated (C++ scripts or custom CMD executions).
    *   Configure test parameters (iteration counts, graph sizes etc.).
    *   Execute the benchmark. The system automatically compiles C++ code on-the-fly, isolating and executing the iterations.
6.  **Results Interpretation:** Review the final compiled statistics, including execution times presented instantly via multiple charts (Mean, Median, P95). The system also builds dynamic results tables using regex-extracted data from algorithm outputs, which can be immediately exported to **CSV** or **LaTeX** code for publications.

---

## 9. Project Structure

The project is divided into backend logic (Flask) and modular frontend (Vanilla JS + ES6 Modules).

```text
/
├── web_app/
│   ├── app.py                 # Main entry point (Flask server)
│   ├── auth.py                # Authentication logic
│   ├── config.py              # Application configuration
│   ├── api/                   # REST API Endpoints (Blueprints)
│   │   ├── admin.py           # Admin tools
│   │   ├── algorithms.py      # Algorithm management
│   │   ├── analysis.py        # Graph analysis (Coloring, Transitivity)
│   │   ├── benchmark.py       # Benchmarking engine
│   │   ├── explorer.py        # Database explorer API
│   │   ├── graphs.py          # Graph operations
│   │   ├── solve.py           # Solver integration
│   │   └── petri/             # Petri Net operations (Blueprints & Utils)
│   │
│   ├── analysis/              # Business logic & Mathematical core
│   │   ├── reachability.py    # Reachability graph generation
│   │   ├── concurrency.py     # Concurrency relation analysis
│   │   ├── coloring.py        # Graph coloring algorithms
│   │   ├── transitivity.py    # Transitive orientability check
│   │   ├── mis.py             # Maximum Independent Set logic
│   │   ├── benchmarking/      # Test runner and generator
│   │   └── custom_algos/      # Template for user-defined C++ scripts
│   │
│   ├── data/                  # Data access layer (PostgreSQL integration)
│   ├── static/js/             # Modular ES6 JavaScript client
│   │   ├── core/              # State management & System core
│   │   ├── domain/            # Domain logic (Petri, Algo, Benchmark)
│   │   ├── engine/            # Canvas rendering & Layout engines
│   │   └── ui/                # UI Components & View management
│   │
│   └── templates/             # Jinja2 HTML Templates
│
├── tests/                     # Unit and integration tests
├── Dockerfile                 # Production environment definition
├── docker-compose.yml         # Multi-container orchestration
└── requirements.txt           # Python dependencies
```

---

## 10. Architecture and Evaluation Pipelining

### 10.1. System Metadata
*   **System Name:** KitaPeNA
*   **Version:** 1.1.0
*   **License:** MIT
*   **Repository:** [GitHub](https://github.com/Seelf/Kitapena)

### 10.2. Functional Overview
**Problem Statement:** Modern research on algorithms for discrete structures, graph theory, and optimization often encounters a fundamental organizational and technological barrier: the lack of standardized, deterministic evaluation mechanisms independent of hardware platforms and local toolchains. The traditional process of testing algorithms implemented in compiled languages (like C++) requires researchers to build custom shell scripts, instrument source code, and manually manage system metrics. This approach introduces an operational overhead that is difficult to quantify, deviations related to operating system specifics, and most importantly, radically limits the reproducibility of results by independent research groups.

The **KitaPeNA** application mitigates this phenomenon by providing a unified, fully web-based benchmarking wrapper. The system automates rigorous I/O mapping procedures and build processes, relieving researchers from the necessity of writing analytical apparatus and enforcing high methodological rigor around the code itself.

### 10.3. Core Architecture Diagram Description
The project is implemented as a multi-tier system, decomposing flows into disjoint domains and reducing the phenomena of overlapping transmission delays.

*   **Presentation Layer:** A dynamic research dashboard built with **Vanilla JS** and a strictly modular **ES6 Module** architecture. It separates system state from domain logic and rendering engines. For advanced representation of topological models, a hardware-accelerated **Canvas API** ensures smooth processing of complex structures without overloading the main browser thread.
*   **API Layer (Routing Core):** The central server operates on **Flask** using a RESTful convention. Access abstraction is organized in an architecture of isolated sub-resources using the **Flask Blueprints** mechanism. The use of Blueprints strictly decomposes services, introducing logical code isolation, deterministic extensibility, and simplified authorization supervision.
*   **Data Layer:** Utilizes **PostgreSQL** for persistent storage, integrated via Docker for consistent development and specialized for research metadata.
*   **Integration Layer (Interoperability Layer):** The most crucial module of the system, acting as a bridge between the Python management environment and C++ execution units. Two bridging libraries interact in a hybrid manner here:
    *   **`ctypes`**: Provides absolutely the flattest and lowest-overhead interface for native types directly linked to the C-ABI (Application Binary Interface).
    *   **`pybind11`**: Used for more complex container representations and parsing C++ object structures, masking the need for manual allocation of object pointers for standard libraries (e.g., `std::vector`).

### 10.4. The Benchmarking Pipeline
The logical core of the application manages an asynchronous statistical evaluation pipeline, which can be broken down into the following execution stages during an on-demand execution:

1.  **C++ Code Injection:** The system receives the C++ code payload from the web wrapper in encrypted packets into the temporary preprocessor environment.
2.  **On-the-fly Compilation:** The context automatically launches the system compiler (e.g., `clang++`). The process is obligatorily equipped with the necessary flags: level 3 optimization (`-O3`), position-independent code generation (`-fPIC`), and targeting the production of shared objects for dynamic linking (`-shared`).
3.  **Shared Object Initialization:** The created `.so` shells (`.dll` for Windows OS) are loaded directly into the host memory area of the Python virtual machine using descriptors in `ctypes.CDLL()`.
4.  **Memory Pointer Resolving:** Pointer compatibility is ensured for dynamic casts from Python to C – including the allocation of reference arrays for large graphs using vector casting instructions like `POINTER(c_int)`.
5.  **Time Measurements & Execution:** The measurement block is executed using deterministic, kernel-resolution timers (`time.perf_counter_ns()`) to eliminate errors from CPU time fluctuations at higher OS layers, guaranteeing the sharpest real-time estimate of CPU occupancy.
6.  **Capture Output:** Data sent through traditional descriptors (`std::cout`, stream operations, or C error outputs) is intercepted by a dynamic wrapper (`CaptureOutput` class manipulating system IO streams) and loaded back into test buffers in Python memory. The Regex Extraction System then derives the final metrics.

### 10.5. Technical Innovations in the Wrapper
The implementation introduces rigorous modernizations compared to ad-hoc scripts:
*   **On-the-fly Compilation Automation:** The researcher modifies the code in the browser-based IDE and runs tests without any interaction with CMake, Makefiles, or the target machine architecture issues.
*   **Overhead Mitigation & Statistical Averaging:** The application preventively applies mechanisms to counteract the influence of OS jitter and context switching. Algorithms are invoked in an initial warm-up phase to saturate the L1/L2 cache before recording measurements.
*   **Low-level File Descriptor Homing:** Extracting output streams from a compiled language without refactoring the source code is achieved via POSIX interface tools (`dup2`). The streams are redirected straight to the evaluator layer without losing the stability of the main engine.

### 10.6. Impact and Reproducibility
Thanks to the architecture presented above, reproducibility of scientific research in the field of algorithm design gains a drastically lower threshold of difficulty. Standardizing the loading mechanism makes it easier for digital laboratories to perform rigorous counter-comparisons of algorithms (e.g., Maximum Independent Set solutions), as all stakeholders base their estimators on the identical operating environment and hardware pointer parser. Investing in this web-compilation architecture allows scientists to utilize ready-made computational artifacts for journal reviews.

---

## 11. Roadmap

The project is actively developed. While many foundational blocks (like custom CMD wrappers, GSPN support, and JSON portability) have been established, upcoming plans include:

1.  **Dedicated Tool Plugins**:
    *   While universal CLI embeddings exist, adding native out-of-the-box GUI wrappers for specific tools like HippoCPS and PIPE.
    *   Main goal is to expand the "Big Laboratory" paradigm to evaluate analysis times of as many tools as natively possible with zero configuration.

2.  **API Extensibility**:
    *   Integration with external solvers via network requests (APIs for other online tools to push/pull computing results directly from KitaPeNA).

3.  **Expanded Data Export**:
    *   While CSV and LaTeX exports are implemented, future iterations plan to introduce compiled PDF generation and structural Excel (XLSX) summaries with embedded charts.

4.  **Native Parsers Pipeline**:
    *   Developing out-of-the-box, hardcoded parsers for specific legacy Petri Net XML formats that are too complex for the experimental Universal Parser Builder.

---

## 12. Authors
*   **Dawid Konarczak** - *Lead Developer & Researcher* - ORCID: [https://orcid.org/0009-0008-8239-1426](https://orcid.org/0009-0008-8239-1426)

## 13. Citation
If you use KitaPeNA in your research, please cite it using the generated Zenodo DOI. Once published, you can use the following BibTeX entry:

```bibtex
@software{kitapena_2026,
  author       = {Dawid Konarczak},
  title        = {KitaPeNA: A Web-based Petri nets suite},
  year         = {2026},
  publisher    = {Zenodo},
  doi          = {10.5281/zenodo.18712856},
  url          = {https://doi.org/10.5281/zenodo.18712856}
}
```

## 14. License
This project is licensed under the [MIT License](LICENSE) - see the `LICENSE` file for details.

## 15. Disclaimer
Parts of this application and its documentation were generated or assisted by AI models.
