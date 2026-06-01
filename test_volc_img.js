const https = require('https');

const API_KEY = '868be6ae-cc2e-4948-ad95-1cd87a3c50bc';

const data = JSON.stringify({
  model: 'ep-20250212000000-xxxxx', // Will use endpoint ID if needed, but the /models API said doubao-seedream-5-0-260128 is an object model.
  // Wait, Volcano Engine usually requires creating an endpoint (ep-xxxx) on their console!
  // BUT the models endpoint listed 'doubao-seedream-5-0-260128' directly. Let's try passing the model name.
  model: 'doubao-seedream-5-0-260128',
  prompt: 'A cute cat',
});

const options = {
  hostname: 'ark.cn-beijing.volces.com',
  port: 443,
  path: '/api/v3/images/generations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  }
};

const req = https.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Response:', body));
});
req.on('error', e => console.error(e));
req.write(data);
req.end();
