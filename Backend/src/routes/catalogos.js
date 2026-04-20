// src/routes/catalogos.js
const router = require('express').Router();
const { query } = require('../config/db');

// Caché simple en memoria — regiones y centros raramente cambian
// Se invalida cada 24 horas al reiniciar Render
const cache = {};
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

function getCache(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { delete cache[key]; return null; }
  return entry.data;
}
function setCache(key, data) {
  cache[key] = { data, ts: Date.now() };
}

// ── GET /api/catalogos/regiones ───────────────────────────────────────
router.get('/regiones', async (req, res) => {
  try {
    const cached = getCache('regiones');
    if (cached) return res.json({ ok: true, data: cached });

    const result = await query(`SELECT id_region, nombre FROM regiones ORDER BY nombre`);
    setCache('regiones', result.rows);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/catalogos/centros?region=1 ───────────────────────────────
router.get('/centros', async (req, res) => {
  const { region } = req.query;
  const cacheKey = region ? `centros_${region}` : 'centros_all';
  try {
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ok: true, data: cached });

    const sql = region
      ? `SELECT id_centro, nombre, id_region FROM centros_formacion WHERE id_region = @region ORDER BY nombre`
      : `SELECT id_centro, nombre, id_region FROM centros_formacion ORDER BY nombre`;

    const result = await query(sql, region ? { region: parseInt(region) } : {});
    setCache(cacheKey, result.rows);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/catalogos/tipos-vehiculo ─────────────────────────────────
router.get('/tipos-vehiculo', async (req, res) => {
  try {
    const cached = getCache('tipos_vehiculo');
    if (cached) return res.json({ ok: true, data: cached });

    const result = await query(`SELECT id_tipo, nombre FROM tipos_vehiculo ORDER BY id_tipo`);
    setCache('tipos_vehiculo', result.rows);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

module.exports = router;
