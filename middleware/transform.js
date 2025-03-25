// middleware/transform.js
const mung = require('express-mung');

module.exports = {
  request: (req, res, next) => {
    // Normalize request headers
    req.headers['x-api-version'] = '1.0';
    
    // XML to JSON transformation
    if(req.is('application/xml')) {
      req.body = xml2json(req.body);
    }
    next();
  },

  response: mung.json((body, req, res) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Format response structure
    return { data: body, meta: { timestamp: Date.now() } };
  })
};
