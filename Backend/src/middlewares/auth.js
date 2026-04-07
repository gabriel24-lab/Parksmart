// src/middlewares/auth.js
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'Token requerido.' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;   // { id_usuario, rol, email }
    next();
  } catch {
    return res.status(401).json({ ok: false, message: 'Token inválido o expirado.' });
  }
}

// Solo permite ciertos roles
function requireRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.rol)) {
      return res.status(403).json({ ok: false, message: 'No tienes permiso para esta acción.' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRol };
