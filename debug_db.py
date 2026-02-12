import sqlite3
import json

conn = sqlite3.connect('web_app/graphs.db')
conn.row_factory = sqlite3.Row
rows = conn.execute('SELECT id, name, content_json FROM petri_nets LIMIT 5').fetchall()

for r in rows:
    print(f"ID: {r['id']}, Name: {r['name']}")
    try:
        content = r['content_json']
        print(f"Type: {type(content)}")
        parsed = json.loads(content)
        print(f"Parsed Type: {type(parsed)}")
        if isinstance(parsed, str):
             print("DOUBLE ENCODED JSON DETECTED!")
             parsed_again = json.loads(parsed)
             print(f"Double Parsed keys: {parsed_again.keys()}")
        elif isinstance(parsed, dict):
             print(f"Keys: {parsed.keys()}")
    except Exception as e:
        print(f"Error: {e}")
    print("-" * 20)

conn.close()
