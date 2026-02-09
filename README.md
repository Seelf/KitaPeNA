# MC MIS Research Web App

Aplikacja webowa do edycji, analizy i symulacji Sieci Petriego (Petri Nets) oraz wyznaczania Maksymalnych Zbiorów Niezależnych (MIS) na Grafach Osiągalności.

## Instrukcja Uruchomienia / How to Run

### Wymagania
- Python 3.8+
- Przeglądarka internetowa (zalecany Chrome/Edge/Firefox)

### Krok 1: Przygotowanie środowiska (tylko za pierwszym razem)
W terminalu (w głównym folderze projektu):

```bash
# 1. Utwórz wirtualne środowisko
python3 -m venv .venv

# 2. Aktywuj środowisko
# macOS / Linux:
source .venv/bin/activate
# Windows:
# .venv\Scripts\activate

# 3. Zainstaluj zależności
pip install flask networkx matplotlib
# (Możesz też użyć pip install -r requirements.txt jeśli istnieje)
```

### Krok 2: Uruchomienie aplikacji
```bash
# Upewnij się, że jesteś w głównym folderze i masz aktywne venv
python web_app/app.py
```

Aplikacja powninna wystartować pod adresem: [http://127.0.0.1:5002](http://127.0.0.1:5002)

---

## Opis Projektu

Celem projektu jest badanie i wizualizacja problemu wyznaczania **Maksymalnych Zbiorów Niezależnych (Maximum Independent Sets - MIS)** w kontekście systemów współbieżnych modelowanych za pomocą Sieci Petriego.

Proces badawczy w aplikacji wygląda następująco:
1.  **Edytor Sieci Petriego**: Użytkownik tworzy model sieci (Miejsca, Tranzycje, Łuki, Tokeny).
2.  **Analiza Osiągalności**: Aplikacja generuje Graf Osiągalności (Reachability Graph) na podstawie modelu. Każdy węzeł grafu to unikalny stan (znakowanie) sieci.
3.  **MIS Solver**: Algorytm wyznacza zbiory stanów, które są niezależne (niepołączone krawędziami w grafie osiągalności), co ma zastosowanie w analizie współbieżności i redukcji przestrzeni stanów.

---

## Struktura Plików i Folderów

Projekt został zrefaktoryzowany, aby oddzielić logikę backendu od frontendu oraz przenieść starsze narzędzia desktopowe do dedykowanego folderu.

```
/
├── web_app/               # Główna aplikacja webowa (Flask + JS)
│   ├── app.py             # Serwer aplikacji, routing API
│   ├── analysis/          # Moduły analityczne (logika biznesowa)
│   │   ├── reachability.py # Generowanie Grafu Osiągalności (BFS)
│   │   ├── concurrency.py  # Generowanie Grafu Współbieżności
│   │   ├── coloring.py     # Algorytmy kolorowania grafów (DSatur, Backtracking)
│   │   ├── transitivity.py # Sprawdzanie przechodniej orientowalności (TRO)
│   │   └── mis.py          # Algorytmy wyznaczania MIS (Maksymalnych Zbiorów Niezależnych)
│   ├── templates/
│   │   └── index.html     # Single Page Application (SPA)
│   └── static/
│       ├── css/           # Style (Dark Mode, Layout)
│       └── js/            # Logika Frontendowa (opis poniżej)
│
├── tools/                 # Narzędzia pomocnicze
│   └── desktop_editor/    # (Legacy) Poprzednia wersja desktopowa (PyQt/Tkinter)
│       ├── MIS.py
│       ├── main.py
│       └── ...
│
├── tests/                 # Testy jednostkowe
│   └── test_mis_logic.py
└── .gitignore             # Konfiguracja Git
```

### Moduły Frontendowe (`web_app/static/js/`)

Frontend został podzielony na wyspecjalizowane moduły ES6, komunikujące się przez centralny stan (`state.js`) i system zdarzeń.

| Moduł | Opis Funkcjonalności |
|-------|----------------------|
| **`main.js`** | **Core**. Inicjalizacja aplikacji, obsługa głównego paska narzędzi, router kontekstów (Petri / MIS / Concurrency). |
| **`tabs.js`** | **Zarządzanie sesją**. Obsługa wielu kart (plików), zapis/odczyt `localStorage`, izolacja stanu między kartami. |
| **`state.js`** | **Single Source of Truth**. Przechowuje globalny stan widoku, dane grafów (`graphs.MIS`, `graphs.CONCURRENCY`) oraz wyniki analiz. |
| **`petri_state.js`** | Model danych Sieci Petriego (Miejsca, Tranzycje, Łuki). |
| **`petri_render.js`** | Silnik renderujący Sieci Petriego (Canvas API). |
| **`petri_interactions.js`** | Obsługa edycji Sieci Petriego (Drag&Drop, łączenie). |
| **`concurrency.js`** | Obsługa Grafu Współbieżności. Komunikacja z API, pobieranie wyników kolorowania i przechodniości. |
| **`render.js`** | Silnik renderujący Grafy Osiągalności i Współbieżności. Obsługa layou-u siłowego (Force-Directed). |
| **`interactions.js`** | Obsługa interakcji na grafach (przesuwanie, zaznaczanie węzłów). |
| **`ui.js`** | Zarządzanie panelem bocznym (Sidebar), listą wyników, statystykami i legendą kolorowania. |
| **`storage.js`** | Logika zapisu do bazy danych (SQLite) i obsługi plików `.pnh`. |

---

## Nowe Funkcje (v2.0)

### 1. Izolacja Kontekstów i Karty
Aplikacja obsługuje teraz pracę z wieloma plikami jednocześnie. Każda karta posiada własny, **całkowicie odseparowany** stan:
-   Sieć Petriego
-   Wygenerowany Graf Osiągalności
-   Wygenerowany Graf Współbieżności
-   Wyniki analizy

Przełączanie kart automatycznie zapisuje i odtwarza stan, zapobiegając "wyciekom" danych między projektami.

### 2. Graf Współbieżności (Concurrency Graph)
Nowy moduł pozwalający na analizę relacji współbieżności w sieci:
-   Automatyczne generowanie krawędzi współbieżności na podstawie Grafu Osiągalności.
-   **Analiza TRO (Transitively Orientable)**: Sprawdzanie, czy graf jest grafem porównywalności porządku częściowego.
-   **Optymalne Kolorowanie**: Wyznaczanie liczby chromatycznej i wizualizacja podziału na klasy niezależne (użycie algorytmu DSatur + Backtracking).

### 3. Zaawansowana Wizualizacja
-   Nowy silnik renderujący obsługujący zakrzywione krawędzie (Bézier curves) dla lepszej czytelności.
-   Interaktywna legenda kolorowania z możliwością podświetlania grup węzłów.
-   Ulepszony tryb ciemny (Dark Mode) spójny z nowoczesnymi IDE.

---

## API Endpoints

Aplikacja udostępnia REST API do obliczeń nieliniowych:

-   `POST /api/petri/reachability` - Generuje graf osiągalności.
-   `POST /api/petri/concurrency` - Generuje graf współbieżności.
-   `POST /api/analysis/coloring` - Wyznacza optymalne kolorowanie grafu.
-   `POST /api/analysis/transitivity` - Sprawdza orientowalność przechodnią (TRO).
-   `POST /api/solve` - (Legacy) Rozwiązuje problem MIS.
