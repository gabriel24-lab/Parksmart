// src/routes/catalogos.js
const router = require('express').Router();
const { query } = require('../config/db');

// ── GET /api/catalogos/regiones ───────────────────────────────────────
router.get('/regiones', async (req, res) => {
  try {
    const result = await query(`SELECT id_region, nombre FROM regiones ORDER BY nombre`);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/catalogos/centros?region=1 ───────────────────────────────
router.get('/centros', async (req, res) => {
  const { region } = req.query;
  try {
    const sql = region
      ? `SELECT id_centro, nombre, id_region FROM centros_formacion
         WHERE id_region = @region ORDER BY nombre`
      : `SELECT id_centro, nombre, id_region FROM centros_formacion ORDER BY nombre`;

    const result = await query(sql, region ? { region: parseInt(region) } : {});
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/catalogos/tipos-vehiculo ─────────────────────────────────
router.get('/tipos-vehiculo', async (req, res) => {
  try {
    const result = await query(`SELECT id_tipo, nombre FROM tipos_vehiculo ORDER BY id_tipo`);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

module.exports = router;
