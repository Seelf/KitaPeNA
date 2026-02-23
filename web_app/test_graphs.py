import requests
import json

BASE_URL = 'http://localhost:5000'

def test_api():
    print("Testing Graph API endpoints...")
    
    # 1. Save Undirected Graph
    payload_undirected = {
        'name': 'Test Undirected',
        'is_directed': False,
        'nodes': [{'id': 0, 'x': 10, 'y': 10}, {'id': 1, 'x': 20, 'y': 20}],
        'edges': [[0, 1]]
    }
    
    res = requests.post(f"{BASE_URL}/api/graphs", json=payload_undirected)
    print(f"Save Undirected Response: {res.status_code}")
    
    # 2. Save Directed Graph
    payload_directed = {
        'name': 'Test Directed',
        'is_directed': True,
        'nodes': [{'id': 0, 'x': 10, 'y': 10}, {'id': 1, 'x': 20, 'y': 20}, {'id': 2, 'x': 30, 'y': 30}],
        'edges': [[0, 1], [1, 2]]
    }
    
    res = requests.post(f"{BASE_URL}/api/graphs", json=payload_directed)
    print(f"Save Directed Response: {res.status_code}")
    
    # 3. Retrieve All Graphs
    res = requests.get(f"{BASE_URL}/api/graphs")
    if res.status_code == 200:
        graphs = res.json()
        print(f"Total Graphs in DB: {len(graphs)}")
        for g in graphs[:2]:
            print(f" - Graph: {g['name']} (Directed: {g.get('is_directed', 'Unknown')})")
            
if __name__ == '__main__':
    # Make sure your flask app is running before executing this
    print("Please run this manually if the server is up: python3 test_graphs.py")
