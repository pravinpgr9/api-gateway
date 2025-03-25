// services/health-check.js
const healthCheck = {
    endpoints: new Map(),
  
    addService(name, url) {
      this.endpoints.set(name, {
        url: `${url}/health`,
        status: 'unknown'
      });
    },
  
    async checkAll() {
      for (const [name, service] of this.endpoints) {
        try {
          const response = await axios.get(service.url, { timeout: 2000 });
          service.status = response.data.status === 'UP' ? 'healthy' : 'unhealthy';
        } catch {
          service.status = 'unhealthy';
        }
      }
    }
  };
  
  // Start periodic checks
  setInterval(() => healthCheck.checkAll(), 10000);
  