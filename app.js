require('dotenv').config();
const express = require('express');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const { createClient } = require('redis');
const Consul = require('consul');
const axios = require('axios');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const CircuitBreaker = require('opossum');

// Initialize Express app
const app = express();

// Configuration
const config = {
  redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
  consul: { host: process.env.CONSUL_HOST || 'localhost', port: parseInt(process.env.CONSUL_PORT) || 8500, secure: false },
  server: { port: parseInt(process.env.PORT) || 3000, sessionSecret: process.env.SESSION_SECRET || 'your_secret_key' },
  retry: { attempts: 3, delay: 500 },
  circuitBreaker: { timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 10000 }
};

// Redis Client Setup
const redisClient = createClient({ url: config.redis.url });
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.connect().catch(console.error);

// Consul Client Setup
let consulClient;
try {
  consulClient = new Consul({ host: config.consul.host, port: config.consul.port, secure: config.consul.secure, promisify: true });
  console.log('Consul client initialized successfully');
} catch (err) {
  console.error('Failed to initialize Consul client:', err);
  process.exit(1);
}

// Service Discovery Cache
const serviceCache = new Map();

async function discoverService(serviceName) {
  if (serviceCache.has(serviceName)) return serviceCache.get(serviceName);
  try {
    const services = await consulClient.agent.services();
    const serviceInfo = Object.values(services).find(s => s.Service === serviceName);
    if (!serviceInfo) throw new Error(`Service ${serviceName} not found`);
    const serviceUrl = `http://${serviceInfo.Address}:${serviceInfo.Port}`;
    serviceCache.set(serviceName, serviceUrl);
    setTimeout(() => serviceCache.delete(serviceName), 30000);
    return serviceUrl;
  } catch (error) {
    console.error('Consul Error:', error);
    throw new Error('Service discovery failed');
  }
}

// Circuit Breaker for API Calls
async function callService(method, url, data, headers) {
  const axiosRequest = () => axios({ method, url, data, headers, validateStatus: () => true });
  const breaker = new CircuitBreaker(axiosRequest, config.circuitBreaker);

  breaker.fallback(() => ({ status: 503, data: { error: 'Service unavailable (circuit open)' } }));

  for (let attempt = 1; attempt <= config.retry.attempts; attempt++) {
    try {
      return await breaker.fire();
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error.message);
      if (attempt === config.retry.attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, config.retry.delay));
    }
  }
}

async function proxyRequest(req, res) {
  const serviceName = req.params.service;
  try {
    const targetUrl = await discoverService(serviceName);
    const endpoint = req.params[0] || '';
    const response = await callService(req.method, `${targetUrl}/${endpoint}`, req.body, {
      'x-user-id': req.user ? req.user.id : 'anonymous',
      'x-user-role': req.user ? req.user.role : 'guest',
      ...req.headers
    });

    if (req.method === 'GET' && response.status < 400) {
      await redisClient.setEx(`${serviceName}:${req.originalUrl}`, 3600, JSON.stringify(response.data));
    }
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Gateway Error:', error);
    res.status(503).json({ error: 'Service unavailable' });
  }
}

// API Routes
app.all('/api/:service/*', passport.authenticate('jwt', { session: false }), require('./middleware/rbac'), require('./middleware/cache'), proxyRequest);

// Server Startup
const server = app.listen(config.server.port, () => {
  console.log(`API Gateway running on port ${config.server.port}`);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await redisClient.quit();
  server.close(() => process.exit(0));
});
