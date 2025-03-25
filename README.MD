# API Gateway with Express, Redis, Consul, and Passport

This API Gateway is built using Express.js and provides secure authentication, service discovery with Consul, caching with Redis, and rate-limiting using express-rate-limit. It proxies requests to backend services dynamically discovered via Consul.

## Features
- **JWT Authentication** (using Passport.js)
- **Rate Limiting** (global and route-specific)
- **Redis-based Caching** (for GET requests)
- **Service Discovery** (using Consul)
- **Session Management** (via Redis)
- **RBAC (Role-Based Access Control)** middleware
- **Health Check Endpoint**

---

## Table of Contents
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the API Gateway](#running-the-api-gateway)
- [Rate Limiting](#rate-limiting)
- [Service Discovery](#service-discovery)
- [API Routes](#api-routes)
- [Testing](#testing)
- [Error Handling](#error-handling)
- [Deployment](#deployment)

---

## Installation

### Prerequisites
Ensure you have the following installed:
- Node.js (>= 16.x)
- Redis Server
- Consul Server

### Clone Repository
```sh
$ git clone <your-repo-url>
$ cd api-gateway
```

### Install Dependencies
```sh
$ npm install
```

---

## Configuration

Create a `.env` file in the project root:
```env
PORT=3000
SESSION_SECRET=your_secret_key
REDIS_URL=redis://localhost:6379
CONSUL_HOST=localhost
CONSUL_PORT=8500
NODE_ENV=development
```

### Redis Configuration
#### Windows
Download and install Redis from [Memurai](https://www.memurai.com/) or use [Docker](https://docs.docker.com/docker-for-windows/install/):
```sh
$ docker run --name redis -p 6379:6379 -d redis
```

#### Linux
Install Redis:
```sh
$ sudo apt update && sudo apt install redis -y
$ sudo systemctl start redis
```
Check Redis status:
```sh
$ redis-cli ping
```
Expected output:
```sh
PONG
```

### Consul Configuration
#### Windows
Download [Consul](https://developer.hashicorp.com/consul/downloads) and extract it. Run Consul in development mode:
```sh
$ consul agent -dev
```

#### Linux
```sh
$ sudo apt install consul -y
$ consul agent -dev
```

---

## Running the API Gateway

Start the gateway server:
```sh
$ npm start
```
It should display:
```
API Gateway running on port 3000
Consul client initialized successfully
```

---

## Rate Limiting
The gateway enforces rate limits per route:
- **Global:** 100 requests per 15 minutes per IP
- **Authentication:** 50 requests per hour
- **Users:** 200 requests per 15 minutes
- **Products:** 500 requests per 15 minutes
- **Orders:** 300 requests per 15 minutes

To test rate limiting:
```sh
$ for i in {1..110}; do curl -X GET http://localhost:3000/api/users; done
```
After 100 requests, you should see:
```json
{ "error": "Too many requests, please try again later." }
```

---

## Service Discovery
The API Gateway dynamically discovers backend services via Consul. To register a service in Consul:
```sh
$ consul services register -name=users -address=127.0.0.1 -port=4001
```
To list all registered services:
```sh
$ consul catalog services
```

---

## API Routes
### 1. Authentication
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`

### 2. User Management
- `GET /api/users`
- `POST /api/users`

### 3. Product Management
- `GET /api/products`
- `POST /api/products`

### 4. Orders
- `GET /api/orders`
- `POST /api/orders`

### Proxy Requests
All requests are dynamically proxied:
```sh
$ curl -X GET http://localhost:3000/api/products
```
This forwards the request to the `products` service discovered via Consul.

---

## Testing
### 1. Checking Redis Connection
```sh
$ redis-cli ping
```
Expected output:
```sh
PONG
```

### 2. Checking Consul Services
```sh
$ consul catalog services
```

### 3. Testing Authentication
```sh
$ curl -X POST http://localhost:3000/api/auth/login -d '{"username":"test", "password":"test"}' -H "Content-Type: application/json"
```

### 4. Testing Caching (GET Requests)
Run the same GET request twice and compare response times:
```sh
$ curl -X GET http://localhost:3000/api/products
```
The second request should be faster as it is served from Redis.

---

## Error Handling
All errors return JSON responses. Example:
```json
{ "error": "Service unavailable" }
```
If a backend service is down, the gateway automatically returns a `503 Service Unavailable` response.

---

## Deployment
Use Docker for deployment:

### 1. Build Docker Image
```sh
$ docker build -t api-gateway .
```

### 2. Run Container
```sh
$ docker run -p 3000:3000 --env-file .env api-gateway
```

### 3. Deploy with Docker Compose
Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - CONSUL_HOST=consul
    depends_on:
      - redis
      - consul
  redis:
    image: redis:alpine
  consul:
    image: consul:latest
    command: "agent -dev"
```
Start all services:
```sh
$ docker-compose up -d
```

---

## Conclusion
This API Gateway efficiently routes, authenticates, and caches API requests while leveraging service discovery through Consul and Redis for performance optimization.

