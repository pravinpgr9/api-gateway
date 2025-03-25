module.exports = (req, res, next) => {
    const requiredRole = getRequiredRoleForRoute(req.path);
    
    if (!req.user.roles.includes(requiredRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
  
  function getRequiredRoleForRoute(path) {
    // Define route-role mappings
    const roleMap = {
      '/api/user/admin': 'admin',
      '/api/product/create': 'editor',
      // Add more route permissions
    };
    
    return roleMap[path] || 'user';
  }
  