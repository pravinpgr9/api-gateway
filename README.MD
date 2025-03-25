
# API Gateway with Advanced Features

This project implements a scalable API Gateway using Express with advanced security, rate limiting, caching, dynamic routing, and circuit breaking. It also demonstrates service discovery with Consul, request logging with Winston/Morgan, JWT authentication with Passport.js, and a sample setup using Docker and NGINX.

## Features

- **JWT Authentication:**  
  Uses Passport.js with the JWT strategy to secure API endpoints.
  
- **Role-Based Access Control (RBAC):**  
  Middleware enforces role-based permissions (e.g., `role: "user"` or `role: "admin"`).

- **Rate Limiting:**  
  Uses `express-rate-limit` to limit requests per route (global and public-specific).

- **Response Caching:**  
  Caches GET responses in Redis for improved performance.

- **Dynamic Routing & Service Discovery:**  
  Uses Consul for service discovery (with a fallback for dummy microservices during testing) and proxy requests with `http-proxy-middleware`.

- **Circuit Breaking & Retry:**  
  Uses Opossum to implement circuit breaker logic around backend API calls.

- **Request Logging:**  
  Uses Winston (with Morgan integration) for structured logging.

- **Docker & NGINX Setup:**  
  Includes a Dockerfile for containerization and an NGINX configuration for reverse proxy.

## Project Structure

```
.
├── app.js                  # Main API Gateway application
├── auth
│   └── jwt-strategy.js     # Passport JWT strategy configuration
├── middleware
│   ├── cache.js            # Redis caching middleware
│   └── rbac.js             # Role-Based Access Control middleware
├── redisClient.js          # Redis client module
├── package.json
├── Dockerfile              # Docker configuration
└── nginx.conf              # NGINX reverse proxy configuration
```

## Setup

1. **Environment Variables:**  
   Create a `.env` file in the project root with at least the following:

   ```ini
   PORT=3000
   SESSION_SECRET=your_secret_key
   JWT_SECRET=your_secret_key
   JWT_ISSUER=your_issuer       # Optional: Remove issuer/audience in jwt-strategy.js if not used
   JWT_AUDIENCE=your_audience   # Optional
   REDIS_URL=redis://default:B5gysiEe6LRIB8MUJyyKkOKuy8zRRqbC@redis-16915.c15.us-east-1-4.ec2.redns.redis-cloud.com:16915
   CONSUL_HOST=localhost
   CONSUL_PORT=8500
   ```

2. **Install Dependencies:**  
   Run the following command in your project directory:
   
   ```bash
   npm install
   ```

3. **Redis Client Setup:**  
   The Redis client is configured in `redisClient.js`:
   
   ```js
   // redisClient.js
   const { createClient } = require('redis');
   const redisClient = createClient({ 
     url: process.env.REDIS_URL || 'redis://localhost:6379'
   });
   redisClient.on('error', (err) => console.error('Redis Client Error:', err));
   redisClient.connect().catch(console.error);
   module.exports = redisClient;
   ```

## Testing

### Step 1: Run the API Gateway

Open your terminal and run:

```powershell
node app.js
```

You should see logs indicating that:
- Consul client is initialized.
- Dummy User Service is running on port 5001.
- Dummy Order Service is running on port 5002.
- API Gateway is running on port 3000.

### Step 2: Test Rate Limiting

Use PowerShell to simulate multiple requests to a public endpoint:

```powershell
1..105 | ForEach-Object { Invoke-WebRequest -Uri "http://localhost:3000/test/public" -UseBasicParsing | Select-Object -ExpandProperty Content }
```

After a certain number of requests, you should see an error message indicating that too many requests have been made.

*Screenshot for reference:*  
[https://prnt.sc/nG6jVlC_aZ1X](https://prnt.sc/nG6jVlC_aZ1X)

### Step 3: NGINX Server Setup

Create an `nginx.conf` file with the following content:

```nginx
server {
    listen 80;
    location / {
        proxy_pass http://gateway:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

This configuration forwards traffic from port 80 to the API Gateway running on port 3000.

### Step 4: Dockerfile

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
```

This Dockerfile builds your API Gateway image.

### Step 5: Setup of Redis Client

Ensure the `redisClient.js` file is properly set up (as shown above) to connect to your Redis server.

### Step 6: JWT Token Testing

Generate a JWT token on the terminal using the command below:

```powershell
node -e "console.log(require('jsonwebtoken').sign({ id: 1, username: 'testuser', role: 'user' }, 'your_secret_key', { expiresIn: '1h' }))"
```

Copy the generated token, then use it to call the service:

```powershell
curl.exe -H "Authorization: Bearer <your_generated_token>" http://localhost:3000/api/user-service/profile
```

Replace `<your_generated_token>` with your actual token. If the token contains the role `user` and your RBAC middleware permits access, you should receive a response similar to:

```json
{"user":"John Doe","email":"john@example.com"}
```

**Note:**  
The RBAC middleware checks the token’s role. If the token does not include the proper role (e.g., `role:user`), the service will block access and return an error.

## Conclusion

This API Gateway setup demonstrates how to secure microservices using JWT authentication, rate limiting, Redis caching, Consul-based service discovery, circuit breaking, and proper logging. The provided NGINX and Docker configurations make it easier to deploy in production.