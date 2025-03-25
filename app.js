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
const winston = require('winston');
const morgan = require('morgan');

const { createProxyMiddleware } = require('http-proxy-middleware');


require('./auth/jwt-strategy')(passport);


// Initialize Express app
const app = express();
app.use(express.json());
app.use(passport.initialize()); // Initialize passport once


// Configuration
const config = {
  redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
  consul: { host: process.env.CONSUL_HOST || 'localhost', port: parseInt(process.env.CONSUL_PORT) || 8500, secure: false },
  server: { port: parseInt(process.env.PORT) || 3000, sessionSecret: process.env.SESSION_SECRET || 'your_secret_key' },
  retry: { attempts: 3, delay: 500 },
  circuitBreaker: { timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 10000 }
};

// Winston Logger Setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

// Morgan Middleware for Request Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Redis Client Setup
const redisClient = createClient({ url: config.redis.url });
redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
redisClient.connect().catch(console.error);

// Consul Client Setup
let consulClient;
try {
  consulClient = new Consul({ host: config.consul.host, port: config.consul.port, secure: config.consul.secure, promisify: true });
  logger.info('Consul client initialized successfully');
} catch (err) {
  logger.error('Failed to initialize Consul client:', err);
  process.exit(1);
}

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per 15 minutes
  message: { error: "Too many requests, please try again later." }
});

// Apply Rate Limiting to all API routes
app.use('/api/', apiLimiter);

// Service Discovery Cache
const serviceCache = new Map();

async function discoverService(serviceName) {
  // For testing, if the service is our dummy "user-service", return localhost URL
  if (serviceName === 'user-service') {
    return 'http://localhost:5001';
  }
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
    logger.error('Consul Error:', error);
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
      logger.warn(`Attempt ${attempt} failed: ${error.message}`);
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
    logger.error('Gateway Error:', error);
    res.status(503).json({ error: 'Service unavailable' });
  }
}


// Apply a stricter rate limit for public routes
const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Allow only 5 requests per minute
  message: { error: "Too many requests to public routes. Slow down!" }
});

app.use('/test/', publicLimiter);

// Dummy Routes for Testing
app.get('/test/public', (req, res) => {
  logger.info('Public endpoint hit');
  res.json({ message: "This is a public endpoint." });
});

app.get('/test/protected', passport.authenticate('jwt', { session: false }), (req, res) => {
  logger.info(`Protected endpoint accessed by user: ${req.user.id}`);
  res.json({ message: `Hello, ${req.user.id}! This is a protected route.` });
});

// API Routes
app.all('/api/:service/*', passport.authenticate('jwt', { session: false }), require('./middleware/rbac'), require('./middleware/cache'), proxyRequest);



// Dummy Microservices (ONLY for testing)


// 🔹 **API Gateway Routes (Protected with JWT)**
app.use('/api/user-service/profile', 
  passport.authenticate('jwt', { session: false }), 
  createProxyMiddleware({ target: 'http://localhost:5001', changeOrigin: true })
);

app.use('/api/order-service/orders', 
  passport.authenticate('jwt', { session: false }), 
  createProxyMiddleware({ target: 'http://localhost:5002', changeOrigin: true })
);

// 🔹 **Dummy User Service**
const userService = express();
userService.get('/profile', (req, res) => {
  res.json({ user: "John Doe", email: "john@example.com" });
});
userService.listen(5001, () => console.log('✅ User Service running on port 5001'));

// 🔹 **Dummy Order Service**
const orderService = express();
orderService.get('/orders', (req, res) => {
  res.json([{ id: 1, item: "Laptop" }, { id: 2, item: "Phone" }]);
});
orderService.listen(5002, () => console.log('✅ Order Service running on port 5002'));


// Server Startup
const server = app.listen(config.server.port, () => {
  logger.info(`API Gateway running on port ${config.server.port}`);
});

// Graceful Shutdown
// Graceful Shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  // If you need to close redisClient, do it here:
  const redisClient = require('./redisClient');
  await redisClient.quit();
  server.close(() => process.exit(0));
});
