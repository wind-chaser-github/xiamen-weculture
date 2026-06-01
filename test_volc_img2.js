const https = require('https');

const API_KEY = '868be6ae-cc2e-4948-ad95-1cd87a3c50bc';

const data = JSON.stringify({
  model: 'doubao-seedream-5-0-260128',
  prompt: '请将人物（第一张图）自然地融合到这张风景图中（第二张图），作为在厦门旅游的照片。保持风景不变，人物特征保留，看起来像真实的游客打卡照。',
  image: [
    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800', // Random human portrait
    'https://images.unsplash.com/photo-1540206395-68808572332f?w=800'  // Random scenery
  ]
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
