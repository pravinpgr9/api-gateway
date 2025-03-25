const rateLimit = require('express-rate-limit');

module.exports = {
  global: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many requests from this IP'
  }),
  auth: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: 'Too many auth attempts'
  })
};
