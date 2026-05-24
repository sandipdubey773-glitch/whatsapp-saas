module.exports = function auth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    console.warn('[Auth] Unauthorized attempt from IP:', req.ip);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
