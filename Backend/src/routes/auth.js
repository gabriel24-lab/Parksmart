// src/routes/auth.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authMiddleware } = require('../middlewares/auth');

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

// ── GET /api/auth/verificar/:numero_id ───────────────────────────────
// Comprueba si una persona existe en la tabla `personas` del SENA.
// Solo personas con estado EN FORMACION o INDUCCION pueden registrarse.
router.get('/verificar/:numero_id', async (req, res) => {
  const nid = req.params.numero_id?.trim();
  if (!nid) return res.status(400).json({ ok: false, message: 'Número de documento requerido.' });

  try {
    const cuentaExistente = await query(
      'SELECT id_usuario FROM usuarios WHERE numero_id = @nid',
      { nid }
    );
    if (cuentaExistente.rows.length > 0) {
      return res.status(409).json({ ok: false, message: 'Este número de documento ya tiene una cuenta registrada.' });
    }

    const resultado = await query(
      'SELECT "Nombres", "Apellidos", "Correo Electronico", "Tipo de documento", "Estado" FROM personas WHERE "Numero de Documento" = @nid',
      { nid }
    );

    if (!resultado.rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Este número de documento no está registrado en la base de datos del SENA.',
      });
    }

    const p = resultado.rows[0];
    const estadosValidos = ['EN FORMACION', 'INDUCCION'];
    const estado = (p['Estado'] || '').toString().trim().toUpperCase();
    if (!estadosValidos.includes(estado)) {
      return res.status(403).json({
        ok: false,
        message: 'Tu estado en el SENA no permite crear una cuenta en este momento.',
      });
    }

    return res.json({
      ok: true,
      message: 'Persona verificada correctamente.',
      data: {
        nombre_completo: (p['Nombres'] + ' ' + p['Apellidos']).trim(),
        email:           p['Correo Electronico'] || null,
        tipo_id:         p['Tipo de documento']  || null,
      },
    });
  } catch (err) {
    console.error('Error en verificar:', err);
    return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
  }
});

// ── POST /api/auth/register ───────────────────────────────────────────
// Registro público: solo aprendices verificados en la tabla personas.
// El rol se fuerza siempre a 'aprendiz'.
router.post('/register',
  [
    body('numero_id').trim().notEmpty().withMessage('Número de identificación requerido.'),
    body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    const { numero_id, password } = req.body;

    try {
      const dup = await query(
        'SELECT id_usuario FROM usuarios WHERE numero_id = @nid',
        { nid: numero_id }
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ ok: false, message: 'Ese número de identificación ya está registrado.' });
      }

      const persona = await query(
        'SELECT "Nombres", "Apellidos", "Correo Electronico", "Tipo de documento", "Estado" FROM personas WHERE "Numero de Documento" = @nid',
        { nid: numero_id }
      );
      if (!persona.rows.length) {
        return res.status(403).json({
          ok: false,
          message: 'Este número de documento no está registrado en la base de datos del SENA.',
        });
      }
      const p = persona.rows[0];
      const estadosValidos = ['EN FORMACION', 'INDUCCION'];
      const estado = (p['Estado'] || '').toString().trim().toUpperCase();
      if (!estadosValidos.includes(estado)) {
        return res.status(403).json({
          ok: false,
          message: 'Tu estado en el SENA no permite crear una cuenta en este momento.',
        });
      }

      const nombre_completo = (p['Nombres'] + ' ' + p['Apellidos']).trim();
      const email           = p['Correo Electronico'] || null;
      const tipo_id         = p['Tipo de documento']  || null;
      const hash            = await bcrypt.hash(password, 10);
      const qr              = generateQR(numero_id);

      await query(
        "INSERT INTO usuarios (nombre_completo, numero_id, password_hash, qr_code, activo, email, rol, tipo_id) VALUES (@nombre, @nid, @hash, @qr, true, @email, 'aprendiz', @tipo_id)",
        { nombre: nombre_completo, nid: numero_id, hash, qr, email, tipo_id }
      );

      return res.status(201).json({ ok: true, message: 'Usuario registrado correctamente.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
    }
  }
);


// ── POST /api/auth/admin-register ────────────────────────────────────
// Registro manual por admin: sin validar contra tabla personas.
// Permite registrar instructores, funcionarios y cualquier rol.
router.post('/admin-register',
  authMiddleware,
  [
    body('nombre_completo').trim().notEmpty().withMessage('Nombre requerido.'),
    body('numero_id').trim().notEmpty().withMessage('Número de identificación requerido.'),
    body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
    body('rol').isIn(['aprendiz','funcionario','instructor','admin']).withMessage('Rol inválido.'),
  ],
  async (req, res) => {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ ok: false, message: 'Solo los administradores pueden usar este endpoint.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    const { nombre_completo, numero_id, password, rol, tipo_id, email, id_centro } = req.body;

    try {
      const dup = await query(
        'SELECT id_usuario FROM usuarios WHERE numero_id = @nid',
        { nid: numero_id }
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ ok: false, message: 'Ese número de identificación ya está registrado.' });
      }

      const hash = await bcrypt.hash(password, 10);
      const qr   = generateQR(numero_id);

      await query(
        "INSERT INTO usuarios (nombre_completo, numero_id, password_hash, qr_code, activo, email, rol, tipo_id, id_centro) VALUES (@nombre, @nid, @hash, @qr, true, @email, @rol, @tipo_id, @centro)",
        {
          nombre:  nombre_completo,
          nid:     numero_id,
          hash,
          qr,
          email:   email   || null,
          rol,
          tipo_id: tipo_id || null,
          centro:  id_centro ? parseInt(id_centro) : null,
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
        'SELECT id_usuario, nombre_completo, email, password_hash, rol, qr_code, id_centro, activo FROM usuarios WHERE numero_id = @nid',
        { nid: numero_id }
      );

      const user = result.rows[0];
      if (!user) return res.status(401).json({ ok: false, message: 'Credenciales incorrectas.' });
      if (!user.activo) return res.status(403).json({ ok: false, message: 'Cuenta desactivada.' });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ ok: false, message: 'Credenciales incorrectas.' });

      const payload = { id_usuario: user.id_usuario, rol: user.rol, email: user.email };
      const { access, refresh } = signTokens(payload);

      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await query(
        'INSERT INTO tokens_sesion (id_usuario, refresh_token, expira_en) VALUES (@uid, @token, @exp)',
        { uid: user.id_usuario, token: refresh, exp }
      );

      return res.json({
        ok: true,
        access_token:  access,
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
      'SELECT id_token FROM tokens_sesion WHERE refresh_token = @token AND activo = true AND expira_en > NOW()',
      { token: refresh_token }
    );
    if (!row.rows.length) return res.status(401).json({ ok: false, message: 'Refresh token inválido.' });

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
      'UPDATE tokens_sesion SET activo = false WHERE refresh_token = @token',
      { token: refresh_token }
    ).catch(() => {});
  }
  return res.json({ ok: true, message: 'Sesión cerrada.' });
});

module.exports = router;
