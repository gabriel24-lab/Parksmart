// src/routes/parqueadero.js  —  Cupos, historial, stats y operaciones de parqueadero
const router = require('express').Router();
const { query, getClient } = require('../config/db');
const { authMiddleware, requireRol } = require('../middlewares/auth');

router.use(authMiddleware);

function toColombiaIso(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const y   = d.getUTCFullYear();
  const m   = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h   = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const s   = pad(d.getUTCSeconds());
  return `${y}-${m}-${day}T${h}:${min}:${s}-05:00`;
}

function normalizeRegistroFechas(row) {
  return {
    ...row,
    fecha_entrada: toColombiaIso(row.fecha_entrada),
    fecha_salida:  toColombiaIso(row.fecha_salida),
    fecha_accion:  toColombiaIso(row.fecha_accion),
  };
}

// ── Lógica equivalente a dbo.sp_RegistrarEntrada ──────────────────────
async function sp_RegistrarEntrada(client, id_usuario, id_vehiculo, id_lado) {
  // Verificar que no haya una entrada activa
  const activeCheck = await client.query(
    `SELECT id_registro FROM RegistrosUso WHERE id_usuario = $1 AND estado = 'activo'`,
    [id_usuario]
  );
  if (activeCheck.rows.length > 0) {
    throw new Error('Ya tienes una entrada activa en el parqueadero.');
  }

  // Verificar cupos disponibles
  const cupoCheck = await client.query(
    `SELECT l.capacidad, c.ocupados
     FROM Lados l JOIN Cupos c ON c.id_lado = l.id_lado
     WHERE l.id_lado = $1`,
    [id_lado]
  );
  if (cupoCheck.rows.length === 0) throw new Error('Lado de parqueo no encontrado.');
  const { capacidad, ocupados } = cupoCheck.rows[0];
  if (Number(ocupados) >= Number(capacidad)) {
    throw new Error('No hay cupos disponibles en este lado del parqueadero.');
  }

  // Registrar entrada
  const insert = await client.query(
    `INSERT INTO RegistrosUso (id_usuario, id_vehiculo, id_lado, estado)
     VALUES ($1, $2, $3, 'activo')
     RETURNING id_registro`,
    [id_usuario, id_vehiculo, id_lado]
  );

  // Actualizar Cupos
  await client.query(
    `UPDATE Cupos SET ocupados = ocupados + 1, ultima_actualizacion = NOW()
     WHERE id_lado = $1`,
    [id_lado]
  );

  return insert.rows[0].id_registro;
}

// ── Lógica equivalente a dbo.sp_RegistrarSalida ───────────────────────
async function sp_RegistrarSalida(client, id_usuario) {
  // Buscar entrada activa
  const activeEntry = await client.query(
    `SELECT id_registro, id_lado, fecha_entrada
     FROM RegistrosUso
     WHERE id_usuario = $1 AND estado = 'activo'
     ORDER BY fecha_entrada DESC LIMIT 1`,
    [id_usuario]
  );
  if (activeEntry.rows.length === 0) {
    throw new Error('No tienes una entrada activa en el parqueadero.');
  }
  const { id_registro, id_lado, fecha_entrada } = activeEntry.rows[0];

  // Cerrar el registro
  await client.query(
    `UPDATE RegistrosUso
     SET fecha_salida = NOW(),
         duracion_min = EXTRACT(EPOCH FROM NOW() - $2) / 60,
         estado       = 'cerrado'
     WHERE id_registro = $1`,
    [id_registro, fecha_entrada]
  );

  // Liberar cupo
  await client.query(
    `UPDATE Cupos
     SET ocupados = GREATEST(0, ocupados - 1), ultima_actualizacion = NOW()
     WHERE id_lado = $1`,
    [id_lado]
  );

  return id_registro;
}

// ── GET /api/parqueadero/cupos  —  ocupación actual ───────────────────
router.get('/cupos', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM vw_OcupacionActual`);
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
       FROM RegistrosUso r
       JOIN Vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN Lados         l  ON l.id_lado     = r.id_lado
       WHERE r.estado = 'activo'
       GROUP BY l.id_lado, l.nombre, tv.nombre
       ORDER BY l.id_lado, tv.nombre`
    );

    const grupos = {};
    result.rows.forEach(row => {
      if (!grupos[row.id_lado]) grupos[row.id_lado] = {};
      grupos[row.id_lado][row.tipo.toLowerCase()] = Number(row.cantidad);
    });

    const ids  = Object.keys(grupos).map(Number).sort((a, b) => a - b);
    const mapA = grupos[ids[0]] || {};
    const mapB = grupos[ids[1]] || {};

    const totalA = Object.values(mapA).reduce((s, v) => s + v, 0);
    const totalB = Object.values(mapB).reduce((s, v) => s + v, 0);
    const CAPACIDAD_B = 20;

    return res.json({
      ok: true,
      data: {
        rol,
        vista: rol === 'aprendiz' ? 'aprendiz' : 'funcionario',
        lado_a: {
          carros:     mapA['carro']     || 0,
          motos:      mapA['moto']      || 0,
          bicicletas: mapA['bicicleta'] || 0,
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

// ── GET /api/parqueadero/historial  —  mis registros ─────────────────
router.get('/historial', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(200, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;

  try {
    const result = await query(
      `SELECT
         r.id_registro,
         tv.nombre           AS tipo_vehiculo,
         COALESCE(v.placa, v.modelo) AS identificador,
         v.color,
         l.nombre            AS lado,
         r.fecha_entrada,
         r.fecha_salida,
         r.duracion_min,
         r.estado
       FROM RegistrosUso r
       JOIN Vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN Lados         l  ON l.id_lado     = r.id_lado
       WHERE r.id_usuario = @uid
       ORDER BY r.fecha_entrada DESC
       LIMIT @limit OFFSET @offset`,
      { uid: req.user.id_usuario, limit, offset }
    );

    const total = await query(
      `SELECT COUNT(*) AS total FROM RegistrosUso WHERE id_usuario = @uid`,
      { uid: req.user.id_usuario }
    );

    const data = result.rows.map(normalizeRegistroFechas);

    return res.json({
      ok: true,
      data,
      meta: { page, limit, total: Number(total.rows[0].total) },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/entrada  —  registrar entrada ──────────────
router.post('/entrada', async (req, res) => {
  const { id_vehiculo, id_lado } = req.body;
  if (!id_vehiculo || !id_lado) {
    return res.status(400).json({ ok: false, message: 'id_vehiculo e id_lado son requeridos.' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Validar que el vehículo pertenezca al usuario
    const veh = await client.query(
      `SELECT v.id_tipo, tv.nombre AS tipo
       FROM Vehiculos v
       JOIN TiposVehiculo tv ON tv.id_tipo = v.id_tipo
       WHERE v.id_vehiculo = $1 AND v.id_usuario = $2 AND v.activo = true`,
      [id_vehiculo, req.user.id_usuario]
    );
    if (!veh.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Vehículo no encontrado.' });
    }

    const id_registro = await sp_RegistrarEntrada(
      client,
      req.user.id_usuario,
      parseInt(id_vehiculo),
      parseInt(id_lado)
    );

    await client.query('COMMIT');
    return res.status(201).json({ ok: true, message: 'Entrada registrada.', id_registro });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('entrada activa') || err.message?.includes('cupos')) {
      return res.status(409).json({ ok: false, message: err.message });
    }
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  } finally {
    client.release();
  }
});

// ── POST /api/parqueadero/salida  —  registrar salida ─────────────────
router.post('/salida', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const id_registro = await sp_RegistrarSalida(client, req.user.id_usuario);
    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Salida registrada.', id_registro });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('entrada activa')) {
      return res.status(404).json({ ok: false, message: err.message });
    }
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  } finally {
    client.release();
  }
});

// ── GET /api/parqueadero/estado-actual  —  ¿estoy dentro? ─────────────
router.get('/estado-actual', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         r.id_registro, r.fecha_entrada, l.nombre AS lado,
         tv.nombre AS tipo_vehiculo,
         COALESCE(v.placa, v.modelo) AS identificador
       FROM RegistrosUso r
       JOIN Vehiculos v      ON v.id_vehiculo = r.id_vehiculo
       JOIN TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN Lados l          ON l.id_lado     = r.id_lado
       WHERE r.id_usuario = @uid AND r.estado = 'activo'
       ORDER BY r.fecha_entrada DESC
       LIMIT 1`,
      { uid: req.user.id_usuario }
    );
    return res.json({
      ok: true,
      dentro: result.rows.length > 0,
      data:   result.rows[0] ? normalizeRegistroFechas(result.rows[0]) : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/stats-hoy  —  estadísticas del día ──────────
router.get('/stats-hoy', requireRol('admin'), async (req, res) => {
  try {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

    const stats = await query(
      `SELECT
         COUNT(*) AS entradas_hoy,
         SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas_hoy,
         SUM(CASE WHEN tv.nombre='carro'     THEN 1 ELSE 0 END) AS carros_entradas,
         SUM(CASE WHEN tv.nombre='moto'      THEN 1 ELSE 0 END) AS motos_entradas,
         SUM(CASE WHEN tv.nombre='bicicleta' THEN 1 ELSE 0 END) AS bicis_entradas,
         SUM(CASE WHEN tv.nombre='carro'     AND r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS carros_salidas,
         SUM(CASE WHEN tv.nombre='moto'      AND r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS motos_salidas,
         SUM(CASE WHEN tv.nombre='bicicleta' AND r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS bicis_salidas
       FROM RegistrosUso r
       JOIN Vehiculos v      ON v.id_vehiculo = r.id_vehiculo
       JOIN TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       WHERE r.fecha_entrada::DATE = @hoy::DATE`,
      { hoy }
    );

    const porHora = await query(
      `SELECT
         EXTRACT(HOUR FROM r.fecha_entrada)::INT AS hora,
         COUNT(*) AS entradas,
         SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas
       FROM RegistrosUso r
       WHERE r.fecha_entrada::DATE = @hoy::DATE
       GROUP BY EXTRACT(HOUR FROM r.fecha_entrada)
       ORDER BY hora`,
      { hoy }
    );

    const porSemana = await query(
      `SELECT
         EXTRACT(DOW FROM r.fecha_entrada)::INT AS dia_semana,
         COUNT(*) AS ingresos
       FROM RegistrosUso r
       WHERE r.fecha_entrada >= (NOW() - INTERVAL '6 days')::DATE
       GROUP BY EXTRACT(DOW FROM r.fecha_entrada)
       ORDER BY dia_semana`
    );

    return res.json({
      ok: true,
      data: {
        ...stats.rows[0],
        por_hora:    porHora.rows,
        por_semana:  porSemana.rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/stats-lado  —  estadísticas por lado ─────────
router.get('/stats-lado', requireRol('admin'), async (req, res) => {
  try {
    const id_lado = parseInt(req.query.id_lado);
    if (!id_lado) return res.status(400).json({ ok: false, message: 'id_lado requerido.' });

    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

    const porHora = await query(
      `SELECT
         EXTRACT(HOUR FROM r.fecha_entrada)::INT AS hora,
         COUNT(*) AS entradas,
         SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas
       FROM RegistrosUso r
       WHERE r.fecha_entrada::DATE = @hoy::DATE
         AND r.id_lado = @id_lado
       GROUP BY EXTRACT(HOUR FROM r.fecha_entrada)
       ORDER BY hora`,
      { hoy, id_lado }
    );

    const porTipo = await query(
      `SELECT tv.nombre AS tipo, COUNT(*) AS cantidad
       FROM RegistrosUso r
       JOIN Vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       WHERE r.fecha_entrada::DATE = @hoy::DATE
         AND r.id_lado = @id_lado
       GROUP BY tv.nombre`,
      { hoy, id_lado }
    );

    const porSemana = await query(
      `SELECT
         EXTRACT(DOW FROM r.fecha_entrada)::INT AS dia_semana,
         COUNT(*) AS ingresos
       FROM RegistrosUso r
       WHERE r.fecha_entrada >= (NOW() - INTERVAL '6 days')::DATE
         AND r.id_lado = @id_lado
       GROUP BY EXTRACT(DOW FROM r.fecha_entrada)
       ORDER BY dia_semana`,
      { id_lado }
    );

    return res.json({
      ok: true,
      data: {
        por_hora:    porHora.rows,
        por_tipo:    porTipo.rows,
        por_semana:  porSemana.rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/reciente  —  últimos 200 movimientos del día ─
router.get('/reciente', requireRol('admin'), async (req, res) => {
  try {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const result = await query(
      `SELECT
         u.nombre_completo, u.qr_code,
         tv.nombre AS tipo_vehiculo,
         r.estado,
         l.nombre AS lado,
         CASE WHEN r.estado = 'activo' THEN r.fecha_entrada ELSE r.fecha_salida END AS fecha_accion
       FROM RegistrosUso r
       JOIN Usuarios      u  ON u.id_usuario  = r.id_usuario
       JOIN Vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN Lados         l  ON l.id_lado     = r.id_lado
       WHERE r.fecha_entrada::DATE = @hoy::DATE OR r.fecha_salida::DATE = @hoy::DATE
       ORDER BY fecha_accion DESC
       LIMIT 200`,
      { hoy }
    );
    const data = result.rows.map(normalizeRegistroFechas);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/usuarios-admin  —  lista todos los usuarios ──
router.get('/usuarios-admin', requireRol('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT
         u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
         u.qr_code, u.rol,
         c.nombre AS centro_nombre,
         EXISTS (
           SELECT 1 FROM RegistrosUso r2
           WHERE r2.id_usuario = u.id_usuario AND r2.estado = 'activo'
         ) AS dentro
       FROM Usuarios u
       LEFT JOIN CentrosFormacion c ON c.id_centro = u.id_centro
       WHERE u.activo = true
       ORDER BY u.nombre_completo`
    );

    const usuarios = result.rows;

    const vResult = await query(
      `SELECT v.id_usuario, v.id_vehiculo, tv.nombre AS tipo, v.placa, v.modelo, v.color
       FROM Vehiculos v
       JOIN TiposVehiculo tv ON tv.id_tipo = v.id_tipo
       WHERE v.activo = true`
    );
    const vehiculos = vResult.rows;

    const data = usuarios.map(u => ({
      ...u,
      vehiculos: vehiculos.filter(v => v.id_usuario === u.id_usuario),
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/historial-admin  —  historial por fecha ──────
router.get('/historial-admin', requireRol('admin'), async (req, res) => {
  const fecha = req.query.fecha;
  if (!fecha) return res.status(400).json({ ok: false, message: 'Parámetro fecha requerido.' });
  try {
    const result = await query(
      `SELECT
         r.id_registro,
         u.id_usuario,
         u.nombre_completo,
         tv.nombre                   AS tipo_vehiculo,
         COALESCE(v.placa, v.modelo) AS identificador,
         v.color,
         l.nombre                    AS lado,
         r.fecha_entrada,
         r.fecha_salida,
         r.duracion_min,
         r.estado
       FROM RegistrosUso r
       JOIN Usuarios      u  ON u.id_usuario  = r.id_usuario
       JOIN Vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN Lados         l  ON l.id_lado     = r.id_lado
       WHERE r.fecha_entrada::DATE = @fecha::DATE
       ORDER BY r.fecha_entrada DESC`,
      { fecha }
    );
    const data = result.rows.map(normalizeRegistroFechas);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/escanear  —  admin escanea QR ──────────────
router.post('/escanear', requireRol('admin'), async (req, res) => {
  const { qr_code } = req.body;
  if (!qr_code) return res.status(400).json({ ok: false, message: 'qr_code requerido.' });
  try {
    const uResult = await query(
      `SELECT u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
              u.rol, u.qr_code, c.nombre AS centro_nombre
       FROM Usuarios u
       LEFT JOIN CentrosFormacion c ON c.id_centro = u.id_centro
       WHERE u.qr_code = @qr AND u.activo = true`,
      { qr: qr_code }
    );
    if (!uResult.rows.length)
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    const usuario = uResult.rows[0];

    const vResult = await query(
      `SELECT v.id_vehiculo, tv.nombre AS tipo, v.placa, v.modelo, v.color
       FROM Vehiculos v
       JOIN TiposVehiculo tv ON tv.id_tipo = v.id_tipo
       WHERE v.id_usuario = @uid AND v.activo = true`,
      { uid: usuario.id_usuario }
    );

    const estadoResult = await query(
      `SELECT r.id_registro, r.fecha_entrada, l.nombre AS lado,
              tv.nombre AS tipo_vehiculo, COALESCE(v.placa, v.modelo) AS identificador
       FROM RegistrosUso r
       JOIN Vehiculos v      ON v.id_vehiculo = r.id_vehiculo
       JOIN TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN Lados l          ON l.id_lado     = r.id_lado
       WHERE r.id_usuario = @uid AND r.estado = 'activo'
       ORDER BY r.fecha_entrada DESC
       LIMIT 1`,
      { uid: usuario.id_usuario }
    );

    return res.json({
      ok: true,
      usuario,
      vehiculos:      vResult.rows,
      dentro:         estadoResult.rows.length > 0,
      estado_actual:  estadoResult.rows[0] ? normalizeRegistroFechas(estadoResult.rows[0]) : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/admin-entrada ──────────────────────────────
router.post('/admin-entrada', requireRol('admin'), async (req, res) => {
  const { id_usuario, id_vehiculo, id_lado } = req.body;
  if (!id_usuario || !id_vehiculo || !id_lado)
    return res.status(400).json({ ok: false, message: 'Faltan parámetros.' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const id_registro = await sp_RegistrarEntrada(
      client,
      parseInt(id_usuario),
      parseInt(id_vehiculo),
      parseInt(id_lado)
    );
    await client.query('COMMIT');
    return res.status(201).json({ ok: true, message: 'Entrada registrada.', id_registro });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('entrada activa') || err.message?.includes('cupos'))
      return res.status(409).json({ ok: false, message: err.message });
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  } finally {
    client.release();
  }
});

// ── POST /api/parqueadero/admin-salida ───────────────────────────────
router.post('/admin-salida', requireRol('admin'), async (req, res) => {
  const { id_usuario } = req.body;
  if (!id_usuario) return res.status(400).json({ ok: false, message: 'id_usuario requerido.' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const id_registro = await sp_RegistrarSalida(client, parseInt(id_usuario));
    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Salida registrada.', id_registro });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('entrada activa'))
      return res.status(404).json({ ok: false, message: err.message });
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  } finally {
    client.release();
  }
});

module.exports = router;
