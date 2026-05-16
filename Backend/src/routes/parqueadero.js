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

  // Verificar si el vehículo es bicicleta (id_tipo = 1)
  // Las bicicletas NO consumen cupos — solo se contabilizan
  const tipoCheck = await client.query(
    `SELECT id_tipo FROM vehiculos WHERE id_vehiculo = $1`,
    [id_vehiculo]
  );
  const esBicicleta = tipoCheck.rows.length > 0 && Number(tipoCheck.rows[0].id_tipo) === 1;

  // Solo el Lado A (id_lado=1) tiene cupos controlados. El Lado B es espacio abierto.
  const esLadoA = Number(id_lado) === 1;

  if (!esBicicleta && esLadoA) {
    // Verificar y descontar cupos solo para vehículos no-bicicleta en Lado A
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
  }

  const insert = await client.query(
    `INSERT INTO registros_uso (id_usuario, id_vehiculo, id_lado, estado)
     VALUES ($1, $2, $3, 'activo') RETURNING id_registro`,
    [id_usuario, id_vehiculo, id_lado]
  );

  // Solo actualizar cupos si NO es bicicleta Y está en Lado A (controlado)
  if (!esBicicleta && esLadoA) {
    await client.query(
      `UPDATE cupos SET ocupados = ocupados + 1, ultima_actualizacion = NOW()
       WHERE id_lado = $1`,
      [id_lado]
    );
  }
  return insert.rows[0].id_registro;
}

// ── Lógica de salida ──────────────────────────────────────────────────
async function registrarSalida(client, id_usuario) {
  const activeEntry = await client.query(
    `SELECT r.id_registro, r.id_lado, r.fecha_entrada, v.id_tipo
     FROM registros_uso r
     JOIN vehiculos v ON v.id_vehiculo = r.id_vehiculo
     WHERE r.id_usuario = $1 AND r.estado = 'activo'
     ORDER BY r.fecha_entrada DESC LIMIT 1`,
    [id_usuario]
  );
  if (!activeEntry.rows.length)
    throw new Error('No tienes una entrada activa en el parqueadero.');

  const { id_registro, id_lado, fecha_entrada, id_tipo } = activeEntry.rows[0];
  const esBicicleta = Number(id_tipo) === 1;
  // Solo el Lado A (id_lado=1) tiene cupos controlados
  const esLadoA = Number(id_lado) === 1;

  await client.query(
    `UPDATE registros_uso
     SET fecha_salida = NOW(),
         estado       = 'completado'
     WHERE id_registro = $1`,
    [id_registro]
  );

  // Solo liberar cupo si NO es bicicleta Y estaba en Lado A (controlado)
  if (!esBicicleta && esLadoA) {
    await client.query(
      `UPDATE cupos
       SET ocupados = GREATEST(0, ocupados - 1), ultima_actualizacion = NOW()
       WHERE id_lado = $1`,
      [id_lado]
    );
  }

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

    const mapA = grupos[1] || {};  // Lado A = id_lado 1 (CONTROLADO)
    const mapB = grupos[2] || {};  // Lado B = id_lado 2 (ABIERTO)

    // Lado A: cupos son para carros, motos y furgonetas (bicicletas solo se cuentan)
    const bicisA    = mapA['bicicleta'] || 0;
    const totalA    = Object.values(mapA).reduce((s, v) => s + v, 0);
    const ocupadosA = totalA - bicisA; // solo vehículos que consumen cupo
    const CAPACIDAD_A = 21;

    // Lado B: espacio abierto — solo conteo total por tipo
    const totalB = Object.values(mapB).reduce((s, v) => s + v, 0);

    return res.json({
      ok: true,
      data: {
        rol,
        vista: rol === 'aprendiz' ? 'aprendiz' : 'funcionario',
        lado_a: {
          ocupados:    ocupadosA,
          capacidad:   CAPACIDAD_A,
          disponibles: Math.max(0, CAPACIDAD_A - ocupadosA),
          carros:      (mapA['auto'] || mapA['carro'] || mapA['automóvil'] || 0),
          motos:       (mapA['motocicleta'] || mapA['moto'] || 0),
          bicicletas:  bicisA,
          furgonetas:  (mapA['furgoneta'] || 0),
        },
        lado_b: {
          carros:      (mapB['auto'] || mapB['carro'] || mapB['automóvil'] || 0),
          motos:       (mapB['motocicleta'] || mapB['moto'] || 0),
          bicicletas:  (mapB['bicicleta'] || 0),
          furgonetas:  (mapB['furgoneta'] || 0),
          total:       totalB,
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
router.get('/stats-hoy', requireRol('admin', 'guardia', 'superadmin'), async (req, res) => {
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
         WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
             = (NOW() AT TIME ZONE 'America/Bogota')::DATE`
      ),
      query(
        `SELECT EXTRACT(HOUR FROM (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))::INT AS hora,
                COUNT(*) AS entradas,
                SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas
         FROM registros_uso r
         WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
             = (NOW() AT TIME ZONE 'America/Bogota')::DATE
         GROUP BY EXTRACT(HOUR FROM (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))
         ORDER BY hora`
      ),
      query(
        `SELECT EXTRACT(DOW FROM (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))::INT AS dia_semana,
                COUNT(*) AS ingresos
         FROM registros_uso r
         WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
             >= (NOW() AT TIME ZONE 'America/Bogota' - INTERVAL '6 days')::DATE
         GROUP BY EXTRACT(DOW FROM (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))
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
router.get('/stats-lado', requireRol('admin', 'guardia', 'superadmin'), async (req, res) => {
  try {
    const id_lado = parseInt(req.query.id_lado);
    if (!id_lado) return res.status(400).json({ ok: false, message: 'id_lado requerido.' });

    // FIX: igual que stats-hoy, calcular "hoy" directo en PostgreSQL
    const [porHora, porTipo, porSemana] = await Promise.all([
      query(
        `SELECT EXTRACT(HOUR FROM (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))::INT AS hora,
                COUNT(*) AS entradas,
                SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas
         FROM registros_uso r
         WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
             = (NOW() AT TIME ZONE 'America/Bogota')::DATE AND r.id_lado = @id_lado
         GROUP BY EXTRACT(HOUR FROM (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))
         ORDER BY hora`,
        { id_lado }
      ),
      query(
        `SELECT tv.nombre AS tipo, COUNT(*) AS cantidad
         FROM registros_uso r
         JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
         JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
         WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
             = (NOW() AT TIME ZONE 'America/Bogota')::DATE AND r.id_lado = @id_lado
         GROUP BY tv.nombre`,
        { id_lado }
      ),
      query(
        `SELECT EXTRACT(DOW FROM (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))::INT AS dia_semana,
                COUNT(*) AS ingresos
         FROM registros_uso r
         WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE >= (NOW() AT TIME ZONE 'America/Bogota' - INTERVAL '6 days')::DATE
           AND r.id_lado = @id_lado
         GROUP BY EXTRACT(DOW FROM (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))
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
router.get('/reciente', requireRol('admin', 'guardia', 'superadmin'), async (req, res) => {
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
       WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
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
router.get('/usuarios-admin', requireRol('admin', 'guardia', 'superadmin'), async (req, res) => {
  try {
    const [result, vResult] = await Promise.all([
      query(
        `SELECT u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
                u.qr_code, u.rol, u.foto_perfil, c.nombre AS centro_nombre,
                EXISTS (
                  SELECT 1 FROM registros_uso r2
                  WHERE r2.id_usuario = u.id_usuario AND r2.estado = 'activo'
                ) AS dentro
         FROM usuarios u
         LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
         WHERE u.activo = true ORDER BY u.nombre_completo`
      ),
      query(
        `SELECT v.id_usuario, v.id_vehiculo, tv.nombre AS tipo, v.placa, v.modelo, v.color, v.foto_url
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
router.get('/historial-admin', requireRol('admin', 'guardia', 'superadmin'), async (req, res) => {
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
       WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE = @fecha::DATE
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
router.post('/escanear', requireRol('admin', 'guardia', 'superadmin'), async (req, res) => {
  const { qr_code } = req.body;
  if (!qr_code) return res.status(400).json({ ok: false, message: 'qr_code requerido.' });
  try {
    const uResult = await query(
      `SELECT u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
              u.rol, u.qr_code, u.foto_perfil, c.nombre AS centro_nombre
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
router.post('/admin-entrada', requireRol('admin', 'guardia', 'superadmin'), async (req, res) => {
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
router.post('/admin-salida', requireRol('admin', 'guardia', 'superadmin'), async (req, res) => {
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

// ══════════════════════════════════════════════════════════════════════
// ── ENDPOINTS EXCLUSIVOS SUPERADMIN ──────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

// ── GET /api/parqueadero/guardias ─────────────────────────────────────
// Lista todos los guardias/celadores del sistema con su actividad
router.get('/guardias', requireRol('superadmin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id_usuario, u.nombre_completo, u.numero_id, u.tipo_id,
              u.email, u.activo, u.fecha_registro,
              c.nombre AS centro_nombre,
              0 AS registros_hoy,
              NULL AS ultimo_registro
       FROM usuarios u
       LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
       WHERE u.rol IN ('admin', 'guardia')
       ORDER BY u.activo DESC, u.nombre_completo`
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('guardias GET:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── PUT /api/parqueadero/guardias/:id/toggle ──────────────────────────
// Activar o desactivar cuenta de un guardia
router.put('/guardias/:id/toggle', requireRol('superadmin'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'ID inválido.' });
  try {
    const check = await query(
      `SELECT id_usuario, activo, rol FROM usuarios WHERE id_usuario = @id AND rol IN ('admin', 'guardia')`,
      { id }
    );
    if (!check.rows.length)
      return res.status(404).json({ ok: false, message: 'Guardia no encontrado.' });

    const nuevoEstado = !check.rows[0].activo;
    await query(
      `UPDATE usuarios SET activo = @estado WHERE id_usuario = @id`,
      { estado: nuevoEstado, id }
    );
    return res.json({
      ok: true,
      activo: nuevoEstado,
      message: nuevoEstado ? 'Guardia activado.' : 'Guardia desactivado.',
    });
  } catch (err) {
    console.error('guardias toggle:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── DELETE /api/parqueadero/guardias/:id ──────────────────────────────
// Eliminar permanentemente la cuenta de un guardia (soft delete)
router.delete('/guardias/:id', requireRol('superadmin'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'ID inválido.' });
  try {
    const check = await query(
      `SELECT id_usuario FROM usuarios WHERE id_usuario = @id AND rol IN ('admin', 'guardia')`,
      { id }
    );
    if (!check.rows.length)
      return res.status(404).json({ ok: false, message: 'Guardia no encontrado.' });

    await query(`UPDATE usuarios SET activo = false WHERE id_usuario = @id`, { id });
    return res.json({ ok: true, message: 'Cuenta de guardia desactivada.' });
  } catch (err) {
    console.error('guardias DELETE:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/usuarios-superadmin ──────────────────────────
// Lista TODOS los usuarios incluyendo inactivos, con opción de activar/desactivar
router.get('/usuarios-superadmin', requireRol('superadmin'), async (req, res) => {
  try {
    const [result, vResult] = await Promise.all([
      query(
        `SELECT u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
                u.qr_code, u.rol, u.foto_perfil, u.activo, u.email,
                c.nombre AS centro_nombre,
                EXISTS (
                  SELECT 1 FROM registros_uso r2
                  WHERE r2.id_usuario = u.id_usuario AND r2.estado = 'activo'
                ) AS dentro
         FROM usuarios u
         LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
         ORDER BY u.activo DESC, u.nombre_completo`
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
    console.error('usuarios-superadmin GET:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── PUT /api/parqueadero/usuarios/:id/toggle ──────────────────────────
// Activar o desactivar cualquier usuario (excepto superadmins)
router.put('/usuarios/:id/toggle', requireRol('superadmin'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'ID inválido.' });
  try {
    const check = await query(
      `SELECT id_usuario, activo, rol FROM usuarios WHERE id_usuario = @id`,
      { id }
    );
    if (!check.rows.length)
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    if (check.rows[0].rol === 'superadmin')
      return res.status(403).json({ ok: false, message: 'No puedes modificar a otro superadmin.' });

    const nuevoEstado = !check.rows[0].activo;
    await query(
      `UPDATE usuarios SET activo = @estado WHERE id_usuario = @id`,
      { estado: nuevoEstado, id }
    );
    return res.json({ ok: true, activo: nuevoEstado, message: nuevoEstado ? 'Usuario activado.' : 'Usuario desactivado.' });
  } catch (err) {
    console.error('usuarios toggle:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── PUT /api/parqueadero/usuarios/:id/rol ─────────────────────────────
// Cambiar el rol de cualquier usuario
router.put('/usuarios/:id/rol', requireRol('superadmin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { rol } = req.body;
  const rolesValidos = ['aprendiz', 'funcionario', 'instructor', 'admin', 'guardia'];
  if (!rolesValidos.includes(rol))
    return res.status(400).json({ ok: false, message: 'Rol inválido.' });
  try {
    const check = await query(
      `SELECT id_usuario, rol FROM usuarios WHERE id_usuario = @id`,
      { id }
    );
    if (!check.rows.length)
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    if (check.rows[0].rol === 'superadmin')
      return res.status(403).json({ ok: false, message: 'No puedes modificar a otro superadmin.' });

    await query(`UPDATE usuarios SET rol = @rol WHERE id_usuario = @id`, { rol, id });
    return res.json({ ok: true, message: `Rol actualizado a ${rol}.` });
  } catch (err) {
    console.error('usuarios rol:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});


// ── GET /api/parqueadero/metricas ─────────────────────────────────────
// Dashboard de métricas: totales generales del sistema
router.get('/metricas', requireRol('superadmin'), async (req, res) => {

  // Helper: ejecuta una query y devuelve fallback si falla, sin romper todo
  async function safeQuery(sql, params, fallback) {
    try {
      const r = await query(sql, params);
      return r;
    } catch (err) {
      console.error('[metricas] query falló:', err.message, '\nSQL:', sql.slice(0, 120));
      return { rows: [fallback], rowCount: 0 };
    }
  }

  try {
    const TZ = `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'`;
    const HOY = `(NOW() AT TIME ZONE 'America/Bogota')::date`;

    // ── 1. Usuarios ──────────────────────────────────────────────────
    // Intentamos con created_at primero; si no existe la columna fallará
    // pero el safeQuery lo captura y devuelve ceros.
    const usuariosR = await safeQuery(`
      SELECT
        COUNT(*) FILTER (WHERE activo = true)                        AS total_activos,
        COUNT(*) FILTER (WHERE activo = false)                       AS total_inactivos,
        COUNT(*) FILTER (WHERE rol = 'aprendiz')                     AS aprendices,
        COUNT(*) FILTER (WHERE rol = 'funcionario')                  AS funcionarios,
        COUNT(*) FILTER (WHERE rol = 'instructor')                   AS instructores,
        COUNT(*) FILTER (WHERE rol IN ('admin','guardia'))           AS guardias,
        COUNT(*) FILTER (WHERE activo = true
          AND COALESCE(created_at, fecha_registro, NOW())::date = ${HOY}) AS nuevos_hoy
      FROM usuarios
    `, {}, {
      total_activos: 0, total_inactivos: 0,
      aprendices: 0, funcionarios: 0, instructores: 0, guardias: 0, nuevos_hoy: 0,
    });

    // ── 2. Vehículos ─────────────────────────────────────────────────
    // Intentamos con tipos_vehiculo; si falla (nombre de tabla distinto) usamos fallback
    let vehiculosR = await safeQuery(`
      SELECT
        COUNT(*)                                                      AS total_vehiculos,
        COUNT(*) FILTER (WHERE tv.nombre ILIKE '%auto%'
          OR tv.nombre ILIKE '%carro%' OR tv.nombre ILIKE '%car%')   AS autos,
        COUNT(*) FILTER (WHERE tv.nombre ILIKE '%moto%')             AS motos,
        COUNT(*) FILTER (WHERE tv.nombre ILIKE '%bici%')             AS bicicletas
      FROM vehiculos v
      JOIN tipos_vehiculo tv ON tv.id_tipo = v.id_tipo
      WHERE v.activo = true
    `, {}, { total_vehiculos: 0, autos: 0, motos: 0, bicicletas: 0 });

    // Si la query anterior falló (0 total y hay vehículos), intentar sin JOIN
    if (!Number(vehiculosR.rows[0]?.total_vehiculos)) {
      const alt = await safeQuery(
        `SELECT COUNT(*) AS total_vehiculos FROM vehiculos WHERE activo = true`,
        {}, { total_vehiculos: 0 }
      );
      if (Number(alt.rows[0]?.total_vehiculos) > 0) vehiculosR = alt;
    }

    // ── 3. Registros ─────────────────────────────────────────────────
    const registrosR = await safeQuery(`
      SELECT
        COUNT(*)                                                                                  AS total_registros,
        COUNT(*) FILTER (WHERE (fecha_entrada ${TZ})::date = ${HOY})                             AS hoy,
        COUNT(*) FILTER (WHERE (fecha_entrada ${TZ})::date >= (${HOY} - INTERVAL '7 days'))      AS ultimos_7_dias,
        COUNT(*) FILTER (WHERE (fecha_entrada ${TZ})::date >= (${HOY} - INTERVAL '30 days'))     AS ultimos_30_dias
      FROM registros_uso
    `, {}, { total_registros: 0, hoy: 0, ultimos_7_dias: 0, ultimos_30_dias: 0 });

    // ── 4. Picos por hora (top 5 para gráfica) ───────────────────────
    const picosR = await safeQuery(`
      SELECT
        EXTRACT(HOUR FROM (fecha_entrada ${TZ}))::INT AS hora,
        COUNT(*) AS total
      FROM registros_uso
      WHERE (fecha_entrada ${TZ})::date >= (${HOY} - INTERVAL '30 days')
      GROUP BY hora
      ORDER BY total DESC
      LIMIT 5
    `, {}, null);

    // ── 5. Por tipo de vehículo ───────────────────────────────────────
    let tiposR = await safeQuery(`
      SELECT tv.nombre AS tipo, COUNT(*) AS total
      FROM registros_uso r
      JOIN vehiculos v ON v.id_vehiculo = r.id_vehiculo
      JOIN tipos_vehiculo tv ON tv.id_tipo = v.id_tipo
      WHERE (r.fecha_entrada ${TZ})::date >= (${HOY} - INTERVAL '30 days')
      GROUP BY tv.nombre
      ORDER BY total DESC
    `, {}, null);

    // Si JOIN falló, intentar con tipo_vehiculo (sin s) o solo vehiculos
    if (!tiposR.rows.length) {
      tiposR = await safeQuery(`
        SELECT tv.nombre AS tipo, COUNT(*) AS total
        FROM registros_uso r
        JOIN vehiculos v ON v.id_vehiculo = r.id_vehiculo
        JOIN tipo_vehiculo tv ON tv.id_tipo = v.id_tipo
        WHERE (r.fecha_entrada ${TZ})::date >= (${HOY} - INTERVAL '30 days')
        GROUP BY tv.nombre
        ORDER BY total DESC
      `, {}, null);
    }

    // ── 6. Ingresos por día (últimos 30 días) — para gráfica línea ───
    const diasR = await safeQuery(`
      SELECT
        (fecha_entrada ${TZ})::date AS dia,
        COUNT(*) AS total
      FROM registros_uso
      WHERE (fecha_entrada ${TZ})::date >= (${HOY} - INTERVAL '30 days')
      GROUP BY dia
      ORDER BY dia ASC
    `, {}, null);

    // ── 7. Ingresos por día de la semana (promedio) ──────────────────
    const semanaDiaR = await safeQuery(`
      SELECT
        EXTRACT(DOW FROM (fecha_entrada ${TZ}))::INT AS dow,
        COUNT(*) AS total
      FROM registros_uso
      WHERE (fecha_entrada ${TZ})::date >= (${HOY} - INTERVAL '90 days')
      GROUP BY dow
      ORDER BY dow ASC
    `, {}, null);

    return res.json({ ok: true, data: {
      usuarios:    usuariosR.rows[0] || {},
      vehiculos:   vehiculosR.rows[0] || {},
      registros:   registrosR.rows[0] || {},
      picos_hora:  picosR.rows.filter(Boolean),
      por_tipo:    tiposR.rows.filter(Boolean),
      ingresos_diarios: diasR.rows.filter(Boolean),
      por_dia_semana:   semanaDiaR.rows.filter(Boolean),
    }});

  } catch (err) {
    console.error('metricas error global:', err);
    return res.status(500).json({ ok: false, message: 'Error interno: ' + err.message });
  }
});

// ── GET /api/parqueadero/buscar ────────────────────────────────────────
// Búsqueda global: usuarios por nombre, documento, placa o QR
router.get('/buscar', requireRol('superadmin'), async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ ok: false, message: 'Mínimo 2 caracteres.' });
  try {
    const [uRes, vRes] = await Promise.all([
      query(`SELECT u.id_usuario, u.nombre_completo, u.numero_id, u.tipo_id, u.rol, u.activo,
              u.qr_code, u.email, c.nombre AS centro_nombre,
              EXISTS(SELECT 1 FROM registros_uso r WHERE r.id_usuario = u.id_usuario AND r.estado = 'activo') AS dentro
             FROM usuarios u LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
             WHERE LOWER(u.nombre_completo) LIKE LOWER(@q) OR u.numero_id LIKE @q2 OR LOWER(u.qr_code) LIKE LOWER(@q)
             ORDER BY u.activo DESC, u.nombre_completo LIMIT 20`,
        { q: '%'+q+'%', q2: '%'+q+'%' }),
      query(`SELECT v.id_vehiculo, v.id_usuario, v.placa, v.modelo, v.color, tv.nombre AS tipo,
              u.nombre_completo, u.numero_id
             FROM vehiculos v JOIN tipos_vehiculo tv ON tv.id_tipo = v.id_tipo
             JOIN usuarios u ON u.id_usuario = v.id_usuario
             WHERE LOWER(v.placa) LIKE LOWER(@q) OR LOWER(v.modelo) LIKE LOWER(@q)
             AND v.activo = true
             ORDER BY v.placa LIMIT 10`,
        { q: '%'+q+'%' }),
    ]);
    return res.json({ ok: true, data: { usuarios: uRes.rows, vehiculos: vRes.rows } });
  } catch (err) {
    console.error('buscar:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/alertas ──────────────────────────────────────
// Alertas del sistema: parqueadero lleno, vehículos con +8h, etc.
router.get('/alertas', requireRol('superadmin'), async (req, res) => {
  try {
    const [cuposR, vehiculosLargosR, sinSalidaR] = await Promise.all([
      query(`SELECT l.nombre AS lado, c.ocupados, l.capacidad,
              ROUND(c.ocupados::numeric / NULLIF(l.capacidad,0) * 100) AS pct
             FROM cupos c JOIN lados l ON l.id_lado = c.id_lado`),
      query(`SELECT r.id_registro, u.nombre_completo, u.numero_id,
              COALESCE(v.placa, v.modelo) AS identificador, tv.nombre AS tipo_vehiculo,
              r.fecha_entrada,
              EXTRACT(EPOCH FROM (NOW() - r.fecha_entrada)) / 3600 AS horas_dentro
             FROM registros_uso r
             JOIN usuarios u ON u.id_usuario = r.id_usuario
             JOIN vehiculos v ON v.id_vehiculo = r.id_vehiculo
             JOIN tipos_vehiculo tv ON tv.id_tipo = v.id_tipo
             WHERE r.estado = 'activo'
               AND r.fecha_entrada < NOW() - INTERVAL '8 hours'
             ORDER BY r.fecha_entrada ASC`),
      query(`SELECT COUNT(*) AS sin_salida
             FROM registros_uso WHERE estado = 'activo'`),
    ]);
    const alertas = [];
    cuposR.rows.forEach(row => {
      if (Number(row.pct) >= 90)
        alertas.push({ tipo: 'capacidad', nivel: Number(row.pct) >= 100 ? 'critico' : 'advertencia',
          titulo: `Lado ${row.lado} al ${row.pct}%`,
          descripcion: `${row.ocupados} de ${row.capacidad} espacios ocupados.` });
    });
    vehiculosLargosR.rows.forEach(row => {
      alertas.push({ tipo: 'tiempo', nivel: 'info',
        titulo: `Vehículo +${Math.floor(row.horas_dentro)}h dentro`,
        descripcion: `${row.nombre_completo} — ${row.identificador} (${row.tipo_vehiculo})`,
        detalle: row });
    });
    return res.json({ ok: true, data: { alertas, sin_salida: sinSalidaR.rows[0].sin_salida } });
  } catch (err) {
    console.error('alertas:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/exportar ─────────────────────────────────────
// Exportar historial por rango de fechas
router.get('/exportar', requireRol('superadmin'), async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ ok: false, message: 'Parámetros desde y hasta requeridos.' });
  try {
    const result = await query(
      `SELECT r.id_registro,
              u.nombre_completo, u.numero_id, u.tipo_id, u.rol,
              tv.nombre AS tipo_vehiculo,
              COALESCE(v.placa, v.modelo) AS identificador, v.color,
              l.nombre AS lado,
              r.fecha_entrada, r.fecha_salida,
              EXTRACT(EPOCH FROM (r.fecha_salida - r.fecha_entrada)) / 60 AS duracion_min,
              r.estado
       FROM registros_uso r
       JOIN usuarios       u  ON u.id_usuario  = r.id_usuario
       JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
       JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN lados          l  ON l.id_lado     = r.id_lado
       WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
             BETWEEN @desde::DATE AND @hasta::DATE
       ORDER BY r.fecha_entrada DESC`,
      { desde, hasta }
    );
    return res.json({ ok: true, data: result.rows.map(r => ({
      ...r,
      fecha_entrada: r.fecha_entrada ? new Date(r.fecha_entrada).toISOString() : null,
      fecha_salida:  r.fecha_salida  ? new Date(r.fecha_salida).toISOString()  : null,
    }))});
  } catch (err) {
    console.error('exportar:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});


// ── GET /api/parqueadero/auditoria ────────────────────────────────────
// Log de auditoría: entradas/salidas + registros de usuario por rango
router.get('/auditoria', requireRol('superadmin'), async (req, res) => {
  const { desde, hasta, tipo, q } = req.query;
  const fechaDesde = desde || new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
  const fechaHasta = hasta || new Date().toISOString().slice(0,10);
  try {
    const params = { desde: fechaDesde, hasta: fechaHasta };

    // Entradas y salidas del parqueadero
    let registros = [];
    if (!tipo || tipo === 'entrada' || tipo === 'salida') {
      const r = await query(
        `SELECT
          r.id_registro::text AS id,
          r.fecha_entrada AS fecha,
          CASE WHEN r.fecha_salida IS NOT NULL THEN 'salida' ELSE 'entrada' END AS tipo_accion,
          u.nombre_completo AS actor,
          u.numero_id AS actor_doc,
          u.rol AS actor_rol,
          COALESCE(v.placa, v.modelo, 'Vehículo') AS afectado,
          CONCAT(tv.nombre, ' · Lado ', l.nombre) AS detalle
        FROM registros_uso r
        JOIN usuarios u ON u.id_usuario = r.id_usuario
        JOIN vehiculos v ON v.id_vehiculo = r.id_vehiculo
        JOIN tipos_vehiculo tv ON tv.id_tipo = v.id_tipo
        JOIN lados l ON l.id_lado = r.id_lado
        WHERE (r.fecha_entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
              BETWEEN @desde::DATE AND @hasta::DATE
        ORDER BY r.fecha_entrada DESC
        LIMIT 500`, params);
      // Si filtra por tipo: solo entrada (sin salida registrada) o salida
      registros = r.rows.filter(row => {
        if (tipo === 'entrada') return row.tipo_accion === 'entrada';
        if (tipo === 'salida')  return row.tipo_accion === 'salida';
        return true;
      }).map(row => ({ ...row, fecha: row.fecha }));
    }

    // Registros de nuevas cuentas
    let regUsuarios = [];
    if (!tipo || tipo === 'registro') {
      const r = await query(
        `SELECT
          u.id_usuario::text AS id,
          u.fecha_registro AS fecha,
          'registro' AS tipo_accion,
          'Sistema / Admin' AS actor,
          '' AS actor_doc,
          'sistema' AS actor_rol,
          u.nombre_completo AS afectado,
          CONCAT(u.rol, ' · ', COALESCE(c.nombre, 'Sin centro')) AS detalle
        FROM usuarios u
        LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
        WHERE u.fecha_registro IS NOT NULL
          AND (u.fecha_registro AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')::DATE
              BETWEEN @desde::DATE AND @hasta::DATE
        ORDER BY u.fecha_registro DESC
        LIMIT 200`, params);
      regUsuarios = r.rows;
    }

    // Combinar y ordenar por fecha desc
    let todos = [...registros, ...regUsuarios].sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

    // Filtro de texto
    if (q && q.trim().length >= 2) {
      const lq = q.trim().toLowerCase();
      todos = todos.filter(e =>
        (e.actor||'').toLowerCase().includes(lq) ||
        (e.actor_doc||'').toLowerCase().includes(lq) ||
        (e.afectado||'').toLowerCase().includes(lq) ||
        (e.detalle||'').toLowerCase().includes(lq)
      );
    }

    return res.json({ ok: true, data: todos });
  } catch (err) {
    console.error('auditoria:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

module.exports = router;