// services/consul.js
const consul = require('consul')({ host: process.env.CONSUL_HOST });

const serviceDiscovery = {
  async getServiceUrl(serviceName) {
    const instances = await consul.health.service(serviceName);
    const healthy = instances.filter(i => 
      i.Checks.every(c => c.Status === 'passing')
    );
    
    if(healthy.length === 0) throw new Error('No healthy instances');
    
    // Simple round-robin selection
    const instance = healthy[Math.floor(Math.random() * healthy.length)];
    return `http://${instance.Service.Address}:${instance.Service.Port}`;
  }
};

// Update service registry usage
const targetUrl = await serviceDiscovery.getServiceUrl(service);
