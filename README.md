# MC MIS Research Web App

Aplikacja webowa do edycji, analizy i symulacji Sieci Petriego (Petri Nets) oraz wyznaczania Maksymalnych Zbiorów Niezależnych (MIS) na Grafach Osiągalności.

## 🚀 Instrukcja Uruchomienia / How to Run

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

## 📖 Opis Projektu

Celem projektu jest badanie i wizualizacja problemu wyznaczania **Maksymalnych Zbiorów Niezależnych (Maximum Independent Sets - MIS)** w kontekście systemów współbieżnych modelowanych za pomocą Sieci Petriego.

Proces badawczy w aplikacji wygląda następująco:
1.  **Edytor Sieci Petriego**: Użytkownik tworzy model sieci (Miejsca, Tranzycje, Łuki, Tokeny).
2.  **Analiza Osiągalności**: Aplikacja generuje Graf Osiągalności (Reachability Graph) na podstawie modelu. Każdy węzeł grafu to unikalny stan (znakowanie) sieci.
3.  **MIS Solver**: Algorytm wyznacza zbiory stanów, które są niezależne (niepołączone krawędziami w grafie osiągalności), co ma zastosowanie w analizie współbieżności i redukcji przestrzeni stanów.

---

## 📂 Struktura Plików i Folderów

Projekt podzielony jest na backend w Pythonie (Flask) oraz rozbudowany frontend w JavaScript (Vanilla ES6 Modules).

```
/
├── web_app/               # Główny folder aplikacji webowej
│   ├── app.py             # Entry point (serwer Flask, endpointy API)
│   ├── petri_reachability.py # Logika backendowa generowania grafu osiągalności
│   ├── templates/
│   │   └── index.html     # Główny (i jedyny) plik HTML aplikacji (Single Page App)
│   └── static/
│       ├── css/
│       │   └── style.css  # Stylizacja (Dark Mode, layout VS Code style)
│       └── js/            # Moduły JavaScript (opis poniżej)
│
├── mis_core.py            # Rdzeń algorytmiczny (logika MIS, obsługa grafów NetworkX)
├── mis_editor.py          # (Legacy) Wersja Desktopowa aplikacji (PyQt/Tkinter)
├── MIS.py                 # Skrypty pomocnicze / prototypy
└── .gitignore             # Konfiguracja Git
```

### Moduły Frontendowe (`web_app/static/js/`)

Aplikacja kliencka napisana jest w nowoczesnym JavaScript z podziałem na moduły:

| Plik | Opis Funkcjonalności |
|------|----------------------|
| **`main.js`** | Punkt wejściowy. Inicjalizacja stanu, obsługa globalnych skrótów klawiszowych, integracja modułów. |
| **`tabs.js`** | **Zarządzanie kartami**. Obsługa wielu otwartych plików (MDI), zapisywanie/wczytywanie sesji (`localStorage`), izolacja stanu między kartami. |
| **`petri_state.js`** | Model danych Sieci Petriego (`places`, `transitions`, `arcs`). Logika dodawania/usuwania elementów. |
| **`petri_render.js`** | Silnik renderujący Sieci Petriego na Canvas HTML5. Rysowanie tokenów, strzałek i etykiet. |
| **`petri_interactions.js`** | Obsługa myszy dla Sieci Petriego (Drag&Drop, łączenie elementów, dodawanie tokenów). |
| **`interactions.js`** | Obsługa myszy dla Grafu Osiągalności (MIS). Zaznaczanie, przesuwanie widoku (Pan/Zoom). |
| **`render.js`** | Silnik renderujący Graf Osiągalności (MIS). Wizualizacja węzłów, krawędzi i podświetlanie wyników. |
| **`simulation.js`** | Logika symulacji MIS. Odtwarzanie kroków rozwiązania, interakcja z API `/api/solve`. |
| **`state.js`** | Globalny stan aplikacji dla trybu MIS (lista węzłów, krawędzi, ustawienia kamery). |
| **`ui.js`** | Funkcje aktualizujące interfejs DOM (Sidebar, Toolbar, Lista Wyników, Statystyki). |
| **`storage.js`** | (Opcjonalny) Pomocnicze funkcje zapisu lokalnego (zintegrowane głównie w `tabs.js`). |

---

## 🛠 Kluczowe Funkcje i Metody

### Backend (`app.py` & `petri_reachability.py`)
-   **`/api/petri/reachability` (POST)**: Przyjmuje definicję sieci Petriego (JSON), buduje graf osiągalności metodą BFS i zwraca węzły/krawędzie.
-   **`/api/solve` (POST)**: Rozwiązuje problem MIS dla przesłanego grafu.
-   **`/api/petri/saved` (CRUD)**: Zarządzanie zapisanymi sieciami w bazie danych SQLite.

### Frontend (`simulation.js`)
-   **`fetchSolution()`**: Wysyła graf do API, odbiera strumieniowo wyniki (Server-Sent Events / Chunked) i aktualizuje listę kroków.
-   **`triggerAutoSave()`**: (Wstrzyknięte) Automatyczny zapis stanu symulacji do `localStorage` po każdym kroku, zapewniający przetrwanie danych po odświeżeniu strony.

### Frontend (`tabs.js`)
-   **`saveCurrentStateToTab(tabId)`**: Wykonuje głęboką kopię (Deep Copy) całego stanu edytora (Petri + MIS) do obiektu karty.
-   **`restoreStateFromTab(tab)`**: Odtwarza stan edytora z obiektu karty, dbając o izolację i poprawność kontekstu (View vs Model).
-   **`saveSession() / restoreSession()`**: Serializacja całego paska kart do `localStorage`, umożliwiająca "nieśmiertelność" sesji użytkownika.

---

## 🖥️ Interfejs Użytkownika

1.  **Toolbar (Lewa/Góra)**: Narzędzia edycji (Dodaj Miejsce, Tranzycję, Łuk, Token). Przełącznik trybów (Model / Analysis).
2.  **Canvas (Środek)**: Obszar roboczy z obsługą nieskończonego przesuwania i przybliżania.
3.  **Sidebar (Prawa)**:
    -   **Explorer**: Lista wyników symulacji (kroki MIS).
    -   **Saved Graphs**: Baza zapisanych projektów.
4.  **Tab Bar (Góra)**: Pasek kart z otwartymi projektami.
5.  **Status Bar (Dół)**: Liczniki elementów (Liczba miejsc, tranzycji, węzłów grafu).
