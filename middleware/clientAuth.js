const db = require('../db');

module.exports = function clientAuth(req, res, next) {
  const token = req.headers['x-client-token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const clients = db.get('clients').value();
  const client = clients.find(c => c.clientToken === token);
  if (!client) return res.status(401).json({ error: 'Invalid token' });

  req.clientId = client.id;
  req.clientData = client;
  next();
};
