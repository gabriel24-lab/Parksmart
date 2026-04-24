// src/routes/parqueadero.js
const router = require('express').Router();
const { query, getClient } = require('../config/db');
const { authMiddleware, requireRol } = require('../middlewares/auth');

router.use(authMiddleware);

function toColombiaIso(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  // Devolver UTC puro — el frontend convierte a Colombia con timeZone:'America/Bogota'
  return d.toISOString();
}

function normalizeRegistroFechas(row) {
  return {
    ...row,
    fecha_entrada: toColombiaIso(row.fecha_entrada),
    fecha_salida:  toColombiaIso(row.fecha_salida),
    fecha_accion:  toColombiaIso(row.fecha_accion),
  };
}

// ── Lógica de entrada (equivalente al stored proc) ────────────────────
async function registrarEntrada(client, id_usuario, id_vehiculo, id_lado) {
  const activeCheck = await client.query(
    `SELECT id_registro FROM registros_uso WHERE id_usuario = $1 AND estado = 'activo'`,
    [id_usuario]
  );
  if (activeCheck.rows.length > 0)
    throw new Error('Ya tienes una entrada activa en el parqueadero.');

  const cupoCheck = await client.query(
    `SELECT l.capacidad, c.ocupados
     FROM lados l JOIN cupos c ON c.id_lado = l.id_lado
     WHERE l.id_lado = $1`,
    [id_lado]
  );
  if (!cupoCheck.rows.length) throw new Error('Lado de parqueo no encontrado.');
  const { capacidad, ocupados } = cupoCheck.rows[0];
  if (Number(ocupados) >= Number(capacidad))
    throw new Error('No hay cupos disponibles en este lado del parqueadero.');

  const insert = await client.query(
    `INSERT INTO registros_uso (id_usuario, id_vehiculo, id_lado, estado)
     VALUES ($1, $2, $3, 'activo') RETURNING id_registro`,
    [id_usuario, id_vehiculo, id_lado]
  );

  await client.query(
    `UPDATE cupos SET ocupados = ocupados + 1, ultima_actualizacion = NOW()
     WHERE id_lado = $1`,
    [id_lado]
  );

  return insert.rows[0].id_registro;
}

// ── Lógica de salida ──────────────────────────────────────────────────
async function registrarSalida(client, id_usuario) {
  const activeEntry = await client.query(
    `SELECT id_registro, id_lado, fecha_entrada
     FROM registros_uso
     WHERE id_usuario = $1 AND estado = 'activo'
     ORDER BY fecha_entrada DESC LIMIT 1`,
    [id_usuario]
  );
  if (!activeEntry.rows.length)
    throw new Error('No tienes una entrada activa en el parqueadero.');

  const { id_registro, id_lado, fecha_entrada } = activeEntry.rows[0];

  await client.query(
    `UPDATE registros_uso
     SET fecha_salida = NOW(),
         estado       = 'completado'
     WHERE id_registro = $1`,
    [id_registro]
  );

  await client.query(
    `UPDATE cupos
     SET ocupados = GREATEST(0, ocupados - 1), ultima_actualizacion = NOW()
     WHERE id_lado = $1`,
    [id_lado]
  );

  return id_registro;
}

// ── GET /api/parqueadero/cupos ────────────────────────────────────────
router.get('/cupos', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM vw_ocupacion_actual`);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/ocupacion-rol ────────────────────────────────
router.get('/ocupacion-rol', async (req, res) => {
  try {
    const rol = req.user.rol;

    const result = await query(
      `SELECT l.id_lado, l.nombre AS lado, tv.nombre AS tipo, COUNT(*) AS cantidad
       FROM registros_uso r
       JOIN vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN tipos_vehiculo tv ON tv.id_tipo   = v.id_tipo
       JOIN lados         l  ON l.id_lado     = r.id_lado
       WHERE r.estado = 'activo'
       GROUP BY l.id_lado, l.nombre, tv.nombre
       ORDER BY l.id_lado, tv.nombre`
    );

    const grupos = {};
    result.rows.forEach(row => {
      if (!grupos[row.id_lado]) grupos[row.id_lado] = {};
      grupos[row.id_lado][row.tipo.toLowerCase()] = Number(row.cantidad);
    });

    const mapA = grupos[1] || {};
    const mapB = grupos[2] || {};
    const totalA = Object.values(mapA).reduce((s, v) => s + v, 0);
    const totalB = Object.values(mapB).reduce((s, v) => s + v, 0);
    const CAPACIDAD_B = 25;

    return res.json({
      ok: true,
      data: {
        rol,
        vista: rol === 'aprendiz' ? 'aprendiz' : 'funcionario',
        lado_a: {
          carros:     (mapA['auto'] || mapA['carro'] || mapA['automóvil'] || 0),
          motos:      (mapA['motocicleta'] || mapA['moto'] || 0),
          bicicletas: (mapA['bicicleta'] || 0),
          furgonetas: (mapA['furgoneta'] || 0),
          total:      totalA,
        },
        lado_b: {
          ocupados:    totalB,
          capacidad:   CAPACIDAD_B,
          disponibles: Math.max(0, CAPACIDAD_B - totalB),
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/historial ────────────────────────────────────
router.get('/historial', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(200, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;

  try {
    const result = await query(
      `SELECT
         r.id_registro,
         tv.nombre                   AS tipo_vehiculo,
         COALESCE(v.placa, v.modelo) AS identificador,
         v.color,
         l.nombre                    AS lado,
         r.fecha_entrada,
         r.fecha_salida,
         EXTRACT(EPOCH FROM (r.fecha_salida - r.fecha_entrada)) / 60 AS duracion_min,
         r.estado
       FROM registros_uso r
       JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
       JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN lados          l  ON l.id_lado     = r.id_lado
       WHERE r.id_usuario = @uid
       ORDER BY r.fecha_entrada DESC
       LIMIT @limit OFFSET @offset`,
      { uid: req.user.id_usuario, limit, offset }
    );

    const total = await query(
      `SELECT COUNT(*) AS total FROM registros_uso WHERE id_usuario = @uid`,
      { uid: req.user.id_usuario }
    );

    return res.json({
      ok: true,
      data: result.rows.map(normalizeRegistroFechas),
      meta: { page, limit, total: Number(total.rows[0].total) },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/entrada ─────────────────────────────────────
router.post('/entrada', async (req, res) => {
  const { id_vehiculo, id_lado } = req.body;
  if (!id_vehiculo || !id_lado)
    return res.status(400).json({ ok: false, message: 'id_vehiculo e id_lado son requeridos.' });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const veh = await client.query(
      `SELECT v.id_tipo FROM vehiculos v
       WHERE v.id_vehiculo = $1 AND v.id_usuario = $2 AND v.activo = true`,
      [id_vehiculo, req.user.id_usuario]
    );
    if (!veh.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Vehículo no encontrado.' });
    }

    const id_registro = await registrarEntrada(
      client, req.user.id_usuario, parseInt(id_vehiculo), parseInt(id_lado)
    );

    await client.query('COMMIT');
    return res.status(201).json({ ok: true, message: 'Entrada registrada.', id_registro });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('activa') || err.message?.includes('cupos'))
      return res.status(409).json({ ok: false, message: err.message });
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  } finally {
    client.release();
  }
});

// ── POST /api/parqueadero/salida ──────────────────────────────────────
router.post('/salida', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const id_registro = await registrarSalida(client, req.user.id_usuario);
    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Salida registrada.', id_registro });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('activa'))
      return res.status(404).json({ ok: false, message: err.message });
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  } finally {
    client.release();
  }
});

// ── GET /api/parqueadero/estado-actual ────────────────────────────────
router.get('/estado-actual', async (req, res) => {
  try {
    const result = await query(
      `SELECT r.id_registro, r.fecha_entrada, l.nombre AS lado,
              tv.nombre AS tipo_vehiculo,
              COALESCE(v.placa, v.modelo) AS identificador
       FROM registros_uso r
       JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
       JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN lados          l  ON l.id_lado     = r.id_lado
       WHERE r.id_usuario = @uid AND r.estado = 'activo'
       ORDER BY r.fecha_entrada DESC LIMIT 1`,
      { uid: req.user.id_usuario }
    );
    return res.json({
      ok:     true,
      dentro: result.rows.length > 0,
      data:   result.rows[0] ? normalizeRegistroFechas(result.rows[0]) : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/stats-hoy ────────────────────────────────────
router.get('/stats-hoy', requireRol('admin'), async (req, res) => {
  try {
    // FIX: "hoy" se calcula en PostgreSQL en zona Colombia para evitar
    // desface con el UTC del servidor de Render
    const [stats, porHora, porSemana] = await Promise.all([
      query(
        `SELECT COUNT(*) AS entradas_hoy,
                SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas_hoy,
                SUM(CASE WHEN tv.nombre='Auto'        THEN 1 ELSE 0 END) AS autos_entradas,
                SUM(CASE WHEN tv.nombre='Motocicleta' THEN 1 ELSE 0 END) AS motos_entradas,
                SUM(CASE WHEN tv.nombre='Bicicleta'   THEN 1 ELSE 0 END) AS bicis_entradas,
                SUM(CASE WHEN tv.nombre='Furgoneta'   THEN 1 ELSE 0 END) AS furgonetas_entradas
         FROM registros_uso r
         JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
         JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
         WHERE (r.fecha_entrada AT TIME ZONE 'America/Bogota')::DATE
             = (NOW() AT TIME ZONE 'America/Bogota')::DATE`
      ),
      query(
        `SELECT EXTRACT(HOUR FROM (r.fecha_entrada AT TIME ZONE 'America/Bogota'))::INT AS hora,
                COUNT(*) AS entradas,
                SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas
         FROM registros_uso r
         WHERE (r.fecha_entrada AT TIME ZONE 'America/Bogota')::DATE
             = (NOW() AT TIME ZONE 'America/Bogota')::DATE
         GROUP BY EXTRACT(HOUR FROM (r.fecha_entrada AT TIME ZONE 'America/Bogota'))
         ORDER BY hora`
      ),
      query(
        `SELECT EXTRACT(DOW FROM (r.fecha_entrada AT TIME ZONE 'America/Bogota'))::INT AS dia_semana,
                COUNT(*) AS ingresos
         FROM registros_uso r
         WHERE (r.fecha_entrada AT TIME ZONE 'America/Bogota')::DATE
             >= (NOW() AT TIME ZONE 'America/Bogota' - INTERVAL '6 days')::DATE
         GROUP BY EXTRACT(DOW FROM (r.fecha_entrada AT TIME ZONE 'America/Bogota'))
         ORDER BY dia_semana`
      ),
    ]);

    return res.json({
      ok: true,
      data: { ...stats.rows[0], por_hora: porHora.rows, por_semana: porSemana.rows },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/stats-lado ───────────────────────────────────
router.get('/stats-lado', requireRol('admin'), async (req, res) => {
  try {
    const id_lado = parseInt(req.query.id_lado);
    if (!id_lado) return res.status(400).json({ ok: false, message: 'id_lado requerido.' });

    // FIX: igual que stats-hoy, calcular "hoy" directo en PostgreSQL
    const [porHora, porTipo, porSemana] = await Promise.all([
      query(
        `SELECT EXTRACT(HOUR FROM (r.fecha_entrada AT TIME ZONE 'America/Bogota'))::INT AS hora,
                COUNT(*) AS entradas,
                SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas
         FROM registros_uso r
         WHERE (r.fecha_entrada AT TIME ZONE 'America/Bogota')::DATE
             = (NOW() AT TIME ZONE 'America/Bogota')::DATE AND r.id_lado = @id_lado
         GROUP BY EXTRACT(HOUR FROM (r.fecha_entrada AT TIME ZONE 'America/Bogota'))
         ORDER BY hora`,
        { id_lado }
      ),
      query(
        `SELECT tv.nombre AS tipo, COUNT(*) AS cantidad
         FROM registros_uso r
         JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
         JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
         WHERE (r.fecha_entrada AT TIME ZONE 'America/Bogota')::DATE
             = (NOW() AT TIME ZONE 'America/Bogota')::DATE AND r.id_lado = @id_lado
         GROUP BY tv.nombre`,
        { id_lado }
      ),
      query(
        `SELECT EXTRACT(DOW FROM (r.fecha_entrada AT TIME ZONE 'America/Bogota'))::INT AS dia_semana,
                COUNT(*) AS ingresos
         FROM registros_uso r
         WHERE (r.fecha_entrada AT TIME ZONE 'America/Bogota')::DATE >= (NOW() AT TIME ZONE 'America/Bogota' - INTERVAL '6 days')::DATE
           AND r.id_lado = @id_lado
         GROUP BY EXTRACT(DOW FROM (r.fecha_entrada AT TIME ZONE 'America/Bogota'))
         ORDER BY dia_semana`,
        { id_lado }
      ),
    ]);

    return res.json({ ok: true, data: { por_hora: porHora.rows, por_tipo: porTipo.rows, por_semana: porSemana.rows } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/reciente ─────────────────────────────────────
router.get('/reciente', requireRol('admin'), async (req, res) => {
  try {
    // FIX: solo muestra registros de HOY en zona Colombia
    // Los activos se ordenan por fecha_entrada, los completados por fecha_salida
    const result = await query(
      `SELECT u.nombre_completo, u.qr_code,
              tv.nombre AS tipo_vehiculo, r.estado, l.nombre AS lado,
              r.fecha_entrada,
              CASE WHEN r.estado = 'activo' THEN r.fecha_entrada ELSE r.fecha_salida END AS fecha_accion
       FROM registros_uso r
       JOIN usuarios       u  ON u.id_usuario  = r.id_usuario
       JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
       JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN lados          l  ON l.id_lado     = r.id_lado
       WHERE (r.fecha_entrada AT TIME ZONE 'America/Bogota')::DATE
           = (NOW() AT TIME ZONE 'America/Bogota')::DATE
       ORDER BY CASE WHEN r.estado = 'activo' THEN r.fecha_entrada ELSE r.fecha_salida END DESC NULLS LAST
       LIMIT 50`
    );
    return res.json({ ok: true, data: result.rows.map(normalizeRegistroFechas) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/usuarios-admin ───────────────────────────────
router.get('/usuarios-admin', requireRol('admin'), async (req, res) => {
  try {
    const [result, vResult] = await Promise.all([
      query(
        `SELECT u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
                u.qr_code, u.rol, c.nombre AS centro_nombre,
                EXISTS (
                  SELECT 1 FROM registros_uso r2
                  WHERE r2.id_usuario = u.id_usuario AND r2.estado = 'activo'
                ) AS dentro
         FROM usuarios u
         LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
         WHERE u.activo = true ORDER BY u.nombre_completo`
      ),
      query(
        `SELECT v.id_usuario, v.id_vehiculo, tv.nombre AS tipo, v.placa, v.modelo, v.color
         FROM vehiculos v
         JOIN tipos_vehiculo tv ON tv.id_tipo = v.id_tipo
         WHERE v.activo = true`
      ),
    ]);

    const data = result.rows.map(u => ({
      ...u,
      vehiculos: vResult.rows.filter(v => v.id_usuario === u.id_usuario),
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/historial-admin ──────────────────────────────
router.get('/historial-admin', requireRol('admin'), async (req, res) => {
  const fecha = req.query.fecha;
  if (!fecha) return res.status(400).json({ ok: false, message: 'Parámetro fecha requerido.' });
  try {
    const result = await query(
      `SELECT r.id_registro, u.id_usuario, u.nombre_completo,
              tv.nombre AS tipo_vehiculo,
              COALESCE(v.placa, v.modelo) AS identificador,
              v.color, l.nombre AS lado,
              r.fecha_entrada, r.fecha_salida,
              EXTRACT(EPOCH FROM (r.fecha_salida - r.fecha_entrada)) / 60 AS duracion_min,
              r.estado
       FROM registros_uso r
       JOIN usuarios       u  ON u.id_usuario  = r.id_usuario
       JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
       JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN lados          l  ON l.id_lado     = r.id_lado
       WHERE (r.fecha_entrada AT TIME ZONE 'America/Bogota')::DATE = @fecha::DATE
       ORDER BY r.fecha_entrada DESC`,
      { fecha }
    );
    return res.json({ ok: true, data: result.rows.map(normalizeRegistroFechas) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/escanear ────────────────────────────────────
router.post('/escanear', requireRol('admin'), async (req, res) => {
  const { qr_code } = req.body;
  if (!qr_code) return res.status(400).json({ ok: false, message: 'qr_code requerido.' });
  try {
    const uResult = await query(
      `SELECT u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
              u.rol, u.qr_code, c.nombre AS centro_nombre
       FROM usuarios u
       LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
       WHERE u.qr_code = @qr AND u.activo = true`,
      { qr: qr_code }
    );
    if (!uResult.rows.length)
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    const usuario = uResult.rows[0];

    // Consultar vehículos y estado actual en paralelo
    const [vResult, estadoResult] = await Promise.all([
      query(
        `SELECT v.id_vehiculo, tv.nombre AS tipo, v.placa, v.modelo, v.color, v.foto_url
         FROM vehiculos v JOIN tipos_vehiculo tv ON tv.id_tipo = v.id_tipo
         WHERE v.id_usuario = @uid AND v.activo = true`,
        { uid: usuario.id_usuario }
      ),
      query(
        `SELECT r.id_registro, r.fecha_entrada, l.nombre AS lado,
                tv.nombre AS tipo_vehiculo, COALESCE(v.placa, v.modelo) AS identificador
         FROM registros_uso r
         JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
         JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
         JOIN lados          l  ON l.id_lado     = r.id_lado
         WHERE r.id_usuario = @uid AND r.estado = 'activo'
         ORDER BY r.fecha_entrada DESC LIMIT 1`,
        { uid: usuario.id_usuario }
      ),
    ]);

    return res.json({
      ok:            true,
      usuario,
      vehiculos:     vResult.rows,
      dentro:        estadoResult.rows.length > 0,
      estado_actual: estadoResult.rows[0] ? normalizeRegistroFechas(estadoResult.rows[0]) : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/admin-entrada ───────────────────────────────
router.post('/admin-entrada', requireRol('admin'), async (req, res) => {
  const { id_usuario, id_vehiculo, id_lado } = req.body;
  if (!id_usuario || !id_vehiculo || !id_lado)
    return res.status(400).json({ ok: false, message: 'Faltan parámetros.' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const id_registro = await registrarEntrada(
      client, parseInt(id_usuario), parseInt(id_vehiculo), parseInt(id_lado)
    );
    await client.query('COMMIT');
    return res.status(201).json({ ok: true, message: 'Entrada registrada.', id_registro });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('activa') || err.message?.includes('cupos'))
      return res.status(409).json({ ok: false, message: err.message });
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  } finally {
    client.release();
  }
});

// ── POST /api/parqueadero/admin-salida ────────────────────────────────
router.post('/admin-salida', requireRol('admin'), async (req, res) => {
  const { id_usuario } = req.body;
  if (!id_usuario) return res.status(400).json({ ok: false, message: 'id_usuario requerido.' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const id_registro = await registrarSalida(client, parseInt(id_usuario));
    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Salida registrada.', id_registro });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('activa'))
      return res.status(404).json({ ok: false, message: err.message });
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  } finally {
    client.release();
  }
});

module.exports = router;
