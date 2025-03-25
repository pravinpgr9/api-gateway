// middleware/circuit-breaker.js
const CircuitBreaker = require('opossum');
const axiosRetry = require('axios-retry');

const breakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
};

const createBreaker = (axiosConfig) => {
  const breaker = new CircuitBreaker(async (config) => {
    const response = await axios(config);
    if(response.status >= 500) throw new Error('Service error');
    return response;
  }, breakerOptions);

  // Axios retry configuration
  axiosRetry(axios, {
    retries: 3,
    retryCondition: (error) => 
      error.code === 'ECONNABORTED' || 
      error.response?.status >= 500
  });

  breaker.fallback(() => ({
    data: { error: 'Service unavailable' },
    status: 503
  }));

  return breaker;
};

module.exports = { createBreaker };
