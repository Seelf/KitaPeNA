import requests

s = requests.Session()
r = s.get('http://localhost:5002/login')
import re
match = re.search(r'name="csrf_token" value="(.*?)"', r.text)
if match:
    csrf = match.group(1)
    res = s.post('http://localhost:5002/login', data={'csrf_token': csrf, 'username': 'admin', 'password': 'admin'})
    dashboard = s.get('http://localhost:5002/')
    print(f"Status Code: {dashboard.status_code}")
    if dashboard.status_code == 500:
        print("INTERNAL SERVER ERROR")
        print(dashboard.text)
    else:
        print("Page head:", dashboard.text[:500])
else:
    print("Could not find csrf token")
