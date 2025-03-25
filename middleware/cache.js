// middleware/cache.js
const redisClient = require('../redisClient'); // Adjust the path if needed

module.exports = async function(req, res, next) {
  const cacheKey = req.originalUrl;
  try {
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }
    next();
  } catch (err) {
    console.error('Cache middleware error:', err);
    next();
  }
};
