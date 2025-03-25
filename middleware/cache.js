module.exports = async (req, res, next) => {
    if (req.method !== 'GET') return next();
    
    const cacheKey = `${req.params.service}:${req.originalUrl}`;
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        source: 'cache',
        data: JSON.parse(cachedData)
      });
    }
    
    next();
  };
  