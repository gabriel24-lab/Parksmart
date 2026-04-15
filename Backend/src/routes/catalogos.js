// src/routes/catalogos.js          ESTE ES EL FILTRO DE LAS REGIONES PARA QUE SALGAN LOS CENTROS DE ESAS REGIONES
const router = require('express').Router();
const { query } = require('../config/db');

// Rutas públicas (no requieren auth)

// ── GET /api/catalogos/regiones ───────────────────────────────────────
router.get('/regiones', async (req, res) => {
  try {
    const result = await query(`SELECT id_region, nombre FROM dbo.Regiones ORDER BY nombre`);
    return res.json({ ok: true, data: result.recordset });
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
      ? `SELECT id_centro, nombre, id_region FROM dbo.CentrosFormacion
         WHERE id_region = @region ORDER BY nombre`
      : `SELECT id_centro, nombre, id_region FROM dbo.CentrosFormacion ORDER BY nombre`;

    const result = await query(sql, region ? { region: parseInt(region) } : {});
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/catalogos/tipos-vehiculo ─────────────────────────────────
router.get('/tipos-vehiculo', async (req, res) => {
  try {
    const result = await query(`SELECT id_tipo, nombre FROM dbo.TiposVehiculo ORDER BY id_tipo`);
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

module.exports = router;
