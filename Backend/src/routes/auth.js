// src/routes/auth.js ESTA ES LA API DEL INICIO DE SESION Y REGISTRO
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authMiddleware } = require('../middlewares/auth');

// ── Helpers ──────────────────────────────────────────────────────────
function generateQR(numeroId) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const short = uuidv4().split('-')[0].toUpperCase();
  return `USR-${date}-${numeroId.slice(-4)}-${short}`;
}

function signTokens(payload) {
  const access = jwt.sign(payload, process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  const refresh = jwt.sign(payload, process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
  return { access, refresh };
}

// ── POST /api/auth/register ───────────────────────────────────────────
router.post('/register',
  [
    body('nombre_completo').trim().notEmpty().withMessage('Nombre requerido.'),
    body('numero_id').trim().notEmpty().withMessage('Número de identificación requerido.'),
    body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    const { nombre_completo, numero_id, password, id_centro, email, rol, tipo_id } = req.body;

    try {
      // Verificar que la identificación no esté ya registrada
      const dup = await query(
        `SELECT id_usuario FROM dbo.Usuarios WHERE numero_id = @nid`,
        { nid: numero_id }
      );
      if (dup.recordset.length > 0) {
        return res.status(409).json({ ok: false, message: 'Ese número de identificación ya está registrado.' });
      }

      const hash = await bcrypt.hash(password, 10);
      const qr   = generateQR(numero_id);

      // Insertar con campos opcionales si vienen del admin
      await query(
        `INSERT INTO dbo.Usuarios
           (nombre_completo, numero_id, password_hash, qr_code, activo, id_centro, email, rol, tipo_id)
         VALUES
           (@nombre, @nid, @hash, @qr, 1, @centro, @email, @rol, @tipo_id)`,
        {
          nombre: nombre_completo,
          nid:    numero_id,
          hash,
          qr,
          centro: id_centro || null,
          email:  email || null,
          rol:    rol || 'aprendiz',
          tipo_id: tipo_id || null
        }
      );

      return res.status(201).json({ ok: true, message: 'Usuario registrado correctamente.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
    }
  }
);

// ── POST /api/auth/login ──────────────────────────────────────────────
router.post('/login',
  [
    body('numero_id').trim().notEmpty().withMessage('Número de identificación requerido.'),
    body('password').notEmpty().withMessage('Contraseña requerida.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    const { numero_id, password } = req.body;

    try {
      const result = await query(
        `SELECT id_usuario, nombre_completo, email, password_hash, rol, qr_code, id_centro, activo
         FROM dbo.Usuarios WHERE numero_id = @nid`,
        { nid: numero_id }
      );

      const user = result.recordset[0];
      if (!user) return res.status(401).json({ ok: false, message: 'Credenciales incorrectas.' });
      if (!user.activo) return res.status(403).json({ ok: false, message: 'Cuenta desactivada.' });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ ok: false, message: 'Credenciales incorrectas.' });

      const payload = { id_usuario: user.id_usuario, rol: user.rol, email: user.email };
      const { access, refresh } = signTokens(payload);

      // Guardar refresh token
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await query(
        `INSERT INTO dbo.TokensSesion (id_usuario, refresh_token, expira_en)
         VALUES (@uid, @token, @exp)`,
        { uid: user.id_usuario, token: refresh, exp }
      );

      return res.json({
        ok: true,
        access_token: access,
        refresh_token: refresh,
        user: {
          id_usuario:      user.id_usuario,
          nombre_completo: user.nombre_completo,
          email:           user.email,
          rol:             user.rol,
          qr_code:         user.qr_code,
          id_centro:       user.id_centro,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
    }
  }
);

// ── POST /api/auth/refresh ─────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ ok: false, message: 'refresh_token requerido.' });

  try {
    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);

    const row = await query(
      `SELECT id_token FROM dbo.TokensSesion
       WHERE refresh_token = @token AND activo = 1 AND expira_en > GETDATE()`,
      { token: refresh_token }
    );
    if (!row.recordset.length) return res.status(401).json({ ok: false, message: 'Refresh token inválido.' });

    const payload = { id_usuario: decoded.id_usuario, rol: decoded.rol, email: decoded.email };
    const { access } = signTokens(payload);

    return res.json({ ok: true, access_token: access });
  } catch {
    return res.status(401).json({ ok: false, message: 'Refresh token expirado.' });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────
router.post('/logout', authMiddleware, async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    await query(
      `UPDATE dbo.TokensSesion SET activo = 0 WHERE refresh_token = @token`,
      { token: refresh_token }
    ).catch(() => {});
  }
  return res.json({ ok: true, message: 'Sesión cerrada.' });
});

module.exports = router;
