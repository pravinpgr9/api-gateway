require('dotenv').config();
const express = require('express');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const { createClient } = require('redis');
const Consul = require('consul');
const axios = require('axios');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

// Initialize Express app
const app = express();

// Configuration
const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  consul: {
    host: process.env.CONSUL_HOST || 'localhost',
    port: parseInt(process.env.CONSUL_PORT) || 8500,
    secure: false
  },
  server: {
    port: parseInt(process.env.PORT) || 3000,
    sessionSecret: process.env.SESSION_SECRET || 'your_secret_key'
  },
  rateLimit: {
    global: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests
      message: 'Too many requests, please try again later.'
    },
    auth: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 50, // Limit auth requests
      message: 'Too many authentication attempts, please try again later.'
    },
    users: {
      windowMs: 15 * 60 * 1000,
      max: 200
    },
    products: {
      windowMs: 15 * 60 * 1000,
      max: 500
    },
    orders: {
      windowMs: 15 * 60 * 1000,
      max: 300
    }
  }
};

// Redis Client Setup
const redisClient = createClient({ url: config.redis.url });
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.connect().catch(console.error);

// Consul Client Setup
let consulClient;
try {
  consulClient = new Consul({
    host: config.consul.host,
    port: config.consul.port,
    secure: config.consul.secure,
    promisify: true
  });
  console.log('Consul client initialized successfully');
} catch (err) {
  console.error('Failed to initialize Consul client:', err);
  process.exit(1);
}

// Service Discovery Cache
const serviceCache = new Map();

// Middleware Setup
app.use(express.json());
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: config.server.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

// Rate Limiting Middleware
const globalLimiter = rateLimit(config.rateLimit.global);
const authLimiter = rateLimit(config.rateLimit.auth);
const usersLimiter = rateLimit(config.rateLimit.users);
const productsLimiter = rateLimit(config.rateLimit.products);
const ordersLimiter = rateLimit(config.rateLimit.orders);

// Apply Global Rate Limit to All API Routes
app.use('/api/', globalLimiter);

// Apply Specific Rate Limits
app.use('/api/auth', authLimiter);
app.use('/api/users', usersLimiter);
app.use('/api/products', productsLimiter);
app.use('/api/orders', ordersLimiter);

// Security Middleware
require('./auth/jwt-strategy')(passport);
app.use(passport.initialize());

/**
 * Service Discovery Helper
 */
async function discoverService(serviceName) {
  if (serviceCache.has(serviceName)) {
    return serviceCache.get(serviceName);
  }
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

/**
 * Proxy Request Handler
 */
async function proxyRequest(req, res) {
  const serviceName = req.params.service;
  try {
    const targetUrl = await discoverService(serviceName);
    const endpoint = req.params[0] || '';
    const response = await axios({
      method: req.method,
      url: `${targetUrl}/${endpoint}`,
      data: req.body,
      headers: {
        'x-user-id': req.user ? req.user.id : 'anonymous',
        'x-user-role': req.user ? req.user.role : 'guest',
        ...req.headers
      },
      validateStatus: () => true
    });
    if (req.method === 'GET' && response.status < 400) {
      const cacheKey = `${serviceName}:${req.originalUrl}`;
      await redisClient.setEx(cacheKey, 3600, JSON.stringify(response.data));
    }
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Gateway Error:', error);
    res.status(503).json({ error: 'Service unavailable' });
  }
}

// API Routes
app.all(
  '/api/:service/*',
  passport.authenticate('jwt', { session: false }),
  require('./middleware/rbac'),
  require('./middleware/cache'),
  proxyRequest
);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      redis: redisClient.isReady ? 'connected' : 'disconnected',
      consul: consulClient ? 'connected' : 'disconnected'
    }
  });
});

// Error Handling
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

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
