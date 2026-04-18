// src/routes/usuarios.js
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authMiddleware } = require('../middlewares/auth');

router.use(authMiddleware);

// ── GET /api/usuarios/perfil ──────────────────────────────────────────
router.get('/perfil', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
         u.email, u.rol, u.qr_code, u.fecha_registro,
         u.id_centro,
         c.nombre   AS centro_nombre,
         c.id_region,
         r.nombre   AS region_nombre
       FROM usuarios u
       LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
       LEFT JOIN regiones r          ON r.id_region = c.id_region
       WHERE u.id_usuario = @uid AND u.activo = true`,
      { uid: req.user.id_usuario }
    );
    if (!result.rows.length)
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── PUT /api/usuarios/perfil ──────────────────────────────────────────
router.put('/perfil',
  [
    body('nombre_completo').trim().notEmpty().withMessage('Nombre requerido.'),
    body('tipo_id').isIn(['TI', 'CC']).withMessage('tipo_id inválido.'),
    body('numero_id').trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg, errors: errors.array() });

    const { nombre_completo, tipo_id, numero_id, id_centro, rol, email } = req.body;

    try {
      const dup = await query(
        `SELECT id_usuario FROM usuarios
         WHERE numero_id = @nid AND id_usuario <> @uid`,
        { nid: numero_id, uid: req.user.id_usuario }
      );
      if (dup.rows.length)
        return res.status(409).json({ ok: false, message: 'Ese número de identificación ya está en uso.' });

      await query(
        `UPDATE usuarios
         SET nombre_completo = @nombre,
             tipo_id         = @tipo_id,
             numero_id       = @nid,
             id_centro       = @centro,
             rol             = @rol,
             email           = @email
         WHERE id_usuario = @uid`,
        {
          nombre:  nombre_completo,
          tipo_id,
          nid:     numero_id,
          centro:  id_centro || null,
          rol:     rol       || null,
          email:   email     || null,
          uid:     req.user.id_usuario,
        }
      );
      return res.json({ ok: true, message: 'Perfil actualizado.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Error interno.' });
    }
  }
);

// ── PUT /api/usuarios/cambiar-password ───────────────────────────────
router.put('/cambiar-password',
  [
    body('password_actual').notEmpty(),
    body('password_nuevo').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, errors: errors.array() });

    const bcrypt = require('bcryptjs');
    const { password_actual, password_nuevo } = req.body;

    try {
      const result = await query(
        `SELECT password_hash FROM usuarios WHERE id_usuario = @uid`,
        { uid: req.user.id_usuario }
      );
      if (!result.rows.length)
        return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });

      const valid = await bcrypt.compare(password_actual, result.rows[0].password_hash);
      if (!valid)
        return res.status(401).json({ ok: false, message: 'Contraseña actual incorrecta.' });

      const hash = await bcrypt.hash(password_nuevo, 10);
      await query(
        `UPDATE usuarios SET password_hash = @hash WHERE id_usuario = @uid`,
        { hash, uid: req.user.id_usuario }
      );
      return res.json({ ok: true, message: 'Contraseña actualizada.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Error interno.' });
    }
  }
);

module.exports = router;
