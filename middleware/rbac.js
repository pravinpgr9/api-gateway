// middleware/rbac.js
module.exports = (req, res, next) => {
  // Set a default role if none exists (e.g., 'guest')
  const userRole = req.user && req.user.role ? req.user.role : 'guest';

  // For example, if you want to allow only 'admin' and 'user' for certain routes:
  const allowedRoles = ['admin', 'user'];

  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};
