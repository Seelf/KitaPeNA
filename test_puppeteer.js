const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5002,
  path: '/login',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // get csrf from html
    const match = data.match(/name="csrf_token" value="(.*?)"/);
    if (!match) return console.log('No csrf_token found');
    const csrf = match[1];
    let cookies = res.headers['set-cookie'];
    if (cookies) cookies = cookies.map(c => c.split(';')[0]).join('; ');

    const postData = `csrf_token=${csrf}&username=admin&password=admin`;
    const postOptions = {
      hostname: 'localhost',
      port: 5002,
      path: '/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length,
        'Cookie': cookies
      }
    };
    
    const postReq = http.request(postOptions, (postRes) => {
        let postCookies = postRes.headers['set-cookie'];
        if (postCookies) postCookies = Array.isArray(postCookies) ? postCookies.map(c => c.split(';')[0]).join('; ') : postCookies.split(';')[0];
        
        const getOptions = {
            hostname: 'localhost',
            port: 5002,
            path: '/',
            method: 'GET',
            headers: { 'Cookie': (postCookies || cookies) }
        };
        const getReq = http.request(getOptions, (getRes) => {
            console.log('INDEX STATUS:', getRes.statusCode);
            let result = '';
            getRes.on('data', c => result+=c);
            getRes.on('end', () => {
                const head = result.substring(0, 500);
                if(getRes.statusCode === 500) console.log(result);
                else console.log(head);
            });
        });
        getReq.end();
    });
    postReq.write(postData);
    postReq.end();
  });
});
req.on('error', (e) => { console.error(`Problem: ${e.message}`); });
req.end();
