// src/routes/parqueadero.js LOS CUPOS DISPONIBLES Y LO QUE SALE EN EL PRINCIPAL VIENEN DE AQUI, TAMBIEN EL HISTORIAL 
const router = require('express').Router();
const { query, execute } = require('../config/db');
const { authMiddleware, requireRol } = require('../middlewares/auth');

router.use(authMiddleware);

// ── GET /api/parqueadero/cupos  —  ocupación actual ───────────────────
router.get('/cupos', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM dbo.vw_OcupacionActual`);
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/historial  —  mis registros de uso ───────────
router.get('/historial', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
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
       FROM dbo.RegistrosUso r
       JOIN dbo.Vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN dbo.Lados         l  ON l.id_lado     = r.id_lado
       WHERE r.id_usuario = @uid
       ORDER BY r.fecha_entrada DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      { uid: req.user.id_usuario, offset, limit }
    );

    const total = await query(
      `SELECT COUNT(*) AS total FROM dbo.RegistrosUso WHERE id_usuario = @uid`,
      { uid: req.user.id_usuario }
    );

    const data = result.recordset.map(r => ({
      ...r,
      fecha_entrada: r.fecha_entrada ? new Date(r.fecha_entrada.getTime() - (5 * 60 * 60 * 1000)).toISOString() : null,
      fecha_salida: r.fecha_salida ? new Date(r.fecha_salida.getTime() - (5 * 60 * 60 * 1000)).toISOString() : null
    }));

    return res.json({
      ok: true,
      data,
      meta: { page, limit, total: total.recordset[0].total },
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

  // Validar acceso según tipo de vehículo y lado
  try {
    const veh = await query(
      `SELECT v.id_tipo, tv.nombre AS tipo
       FROM dbo.Vehiculos v
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo = v.id_tipo
       WHERE v.id_vehiculo = @vid AND v.id_usuario = @uid AND v.activo = 1`,
      { vid: id_vehiculo, uid: req.user.id_usuario }
    );
    if (!veh.recordset.length) {
      return res.status(404).json({ ok: false, message: 'Vehículo no encontrado.' });
    }

    const tipo = veh.recordset[0].tipo;    // bicicleta | carro | moto
    const lado = parseInt(id_lado);         // 1=A  2=B
    const rol = req.user.rol;

    // Reglas de acceso:
    // Se han eliminado las restricciones de Lado B para permitir cualquier vehículo y rol según solicitud.
    // El sistema ahora permite el ingreso a cualquier lado (A o B) independientemente del tipo de vehículo.

    const result = await execute('dbo.sp_RegistrarEntrada', {
      id_usuario: req.user.id_usuario,
      id_vehiculo: parseInt(id_vehiculo),
      id_lado: lado,
    });

    return res.status(201).json({
      ok: true,
      message: 'Entrada registrada.',
      id_registro: result.recordset[0]?.id_registro,
    });
  } catch (err) {
    if (err.message?.includes('entrada activa')) {
      return res.status(409).json({ ok: false, message: err.message });
    }
    if (err.message?.includes('cupos disponibles')) {
      return res.status(409).json({ ok: false, message: err.message });
    }
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/salida  —  registrar salida ─────────────────
router.post('/salida', async (req, res) => {
  try {
    const result = await execute('dbo.sp_RegistrarSalida', {
      id_usuario: req.user.id_usuario,
    });
    return res.json({
      ok: true,
      message: 'Salida registrada.',
      id_registro: result.recordset[0]?.id_registro,
    });
  } catch (err) {
    if (err.message?.includes('entrada activa')) {
      return res.status(404).json({ ok: false, message: err.message });
    }
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/estado-actual  —  ¿estoy dentro? ─────────────
router.get('/estado-actual', async (req, res) => {
  try {
    const result = await query(
      `SELECT TOP 1
         r.id_registro, r.fecha_entrada, l.nombre AS lado,
         tv.nombre AS tipo_vehiculo,
         COALESCE(v.placa, v.modelo) AS identificador
       FROM dbo.RegistrosUso r
       JOIN dbo.Vehiculos v     ON v.id_vehiculo = r.id_vehiculo
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo   = v.id_tipo
       JOIN dbo.Lados l          ON l.id_lado    = r.id_lado
       WHERE r.id_usuario = @uid AND r.estado = 'activo'
       ORDER BY r.fecha_entrada DESC`,
      { uid: req.user.id_usuario }
    );
    return res.json({
      ok: true,
      dentro: result.recordset.length > 0,
      data: result.recordset[0] || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});


// ── GET /api/parqueadero/stats-hoy  —  estadísticas del día actual ───
router.get('/stats-hoy', requireRol('admin'), async (req, res) => {
  try {
    // Usar fecha de Colombia (UTC-5) para no filtrar el día equivocado
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD

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
       FROM dbo.RegistrosUso r
       JOIN dbo.Vehiculos v      ON v.id_vehiculo = r.id_vehiculo
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       WHERE CAST(r.fecha_entrada AS DATE) = @hoy`,
      { hoy }
    );

    // Flujo por hora (hoy)
    const porHora = await query(
      `SELECT
         DATEPART(HOUR, r.fecha_entrada) AS hora,
         COUNT(*) AS entradas,
         SUM(CASE WHEN r.fecha_salida IS NOT NULL THEN 1 ELSE 0 END) AS salidas
       FROM dbo.RegistrosUso r
       WHERE CAST(r.fecha_entrada AS DATE) = @hoy
       GROUP BY DATEPART(HOUR, r.fecha_entrada)
       ORDER BY hora`,
      { hoy }
    );

    // Ingresos últimos 7 días
    const porSemana = await query(
      `SELECT
         DATEPART(WEEKDAY, r.fecha_entrada) AS dia_semana,
         COUNT(*) AS ingresos
       FROM dbo.RegistrosUso r
       WHERE r.fecha_entrada >= DATEADD(DAY, -6, CAST(GETDATE() AS DATE))
       GROUP BY DATEPART(WEEKDAY, r.fecha_entrada)
       ORDER BY dia_semana`,
      {}
    );

    return res.json({
      ok: true,
      data: {
        ...stats.recordset[0],
        por_hora: porHora.recordset,
        por_semana: porSemana.recordset,
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/reciente  —  últimos 8 movimientos del día ───
router.get('/reciente', requireRol('admin'), async (req, res) => {
  try {
    // Usar fecha de Colombia (UTC-5) para no filtrar el día equivocado
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const result = await query(
      `SELECT TOP 8
         u.nombre_completo, u.qr_code,
         tv.nombre AS tipo_vehiculo,
         r.estado,
         l.nombre AS lado,
         CASE WHEN r.estado = 'activo' THEN r.fecha_entrada ELSE r.fecha_salida END AS fecha_accion
       FROM dbo.RegistrosUso r
       JOIN dbo.Usuarios      u  ON u.id_usuario  = r.id_usuario
       JOIN dbo.Vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN dbo.Lados         l  ON l.id_lado     = r.id_lado
       WHERE CAST(r.fecha_entrada AS DATE) = @hoy OR CAST(r.fecha_salida AS DATE) = @hoy
       ORDER BY fecha_accion DESC`,
      { hoy }
    );
    const data = result.recordset.map(r => ({
      ...r,
      fecha_accion: r.fecha_accion ? new Date(r.fecha_accion.getTime() - (5 * 60 * 60 * 1000)).toISOString() : null
    }));
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
         CASE WHEN EXISTS (
           SELECT 1 FROM dbo.RegistrosUso r2
           WHERE r2.id_usuario = u.id_usuario AND r2.estado = 'activo'
         ) THEN 1 ELSE 0 END AS dentro
       FROM dbo.Usuarios u
       LEFT JOIN dbo.CentrosFormacion c ON c.id_centro = u.id_centro
       WHERE u.activo = 1
       ORDER BY u.nombre_completo`,
      {}
    );

    const usuarios = result.recordset;

    // Obtener vehículos para todos los usuarios activos
    const vResult = await query(
      `SELECT v.id_usuario, v.id_vehiculo, tv.nombre AS tipo, v.placa, v.modelo, v.color
       FROM dbo.Vehiculos v
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo = v.id_tipo
       WHERE v.activo = 1`
    );
    const vehiculos = vResult.recordset;

    // Mapear vehículos a cada usuario
    const data = usuarios.map(u => ({
      ...u,
      vehiculos: vehiculos.filter(v => v.id_usuario === u.id_usuario)
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/historial-admin  —  historial por fecha ──────
router.get('/historial-admin', requireRol('admin'), async (req, res) => {
  const fecha = req.query.fecha; // YYYY-MM-DD
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
       FROM dbo.RegistrosUso r
       JOIN dbo.Usuarios      u  ON u.id_usuario  = r.id_usuario
       JOIN dbo.Vehiculos     v  ON v.id_vehiculo = r.id_vehiculo
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN dbo.Lados         l  ON l.id_lado     = r.id_lado
       WHERE CAST(r.fecha_entrada AS DATE) = @fecha
       ORDER BY r.fecha_entrada DESC`,
      { fecha }
    );
    // Convertir las fechas a ISO string con zona horaria de Colombia (UTC-5)
    // Esto asegura que el frontend las interprete correctamente
    const data = result.recordset.map(r => ({
      ...r,
      fecha_entrada: r.fecha_entrada ? new Date(r.fecha_entrada.getTime() - (5 * 60 * 60 * 1000)).toISOString() : null,
      fecha_salida: r.fecha_salida ? new Date(r.fecha_salida.getTime() - (5 * 60 * 60 * 1000)).toISOString() : null
    }));
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
       FROM dbo.Usuarios u
       LEFT JOIN dbo.CentrosFormacion c ON c.id_centro = u.id_centro
       WHERE u.qr_code = @qr AND u.activo = 1`,
      { qr: qr_code }
    );
    if (!uResult.recordset.length)
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    const usuario = uResult.recordset[0];

    const vResult = await query(
      `SELECT v.id_vehiculo, tv.nombre AS tipo, v.placa, v.modelo, v.color
       FROM dbo.Vehiculos v
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo = v.id_tipo
       WHERE v.id_usuario = @uid AND v.activo = 1`,
      { uid: usuario.id_usuario }
    );

    const estadoResult = await query(
      `SELECT TOP 1 r.id_registro, r.fecha_entrada, l.nombre AS lado,
              tv.nombre AS tipo_vehiculo, COALESCE(v.placa, v.modelo) AS identificador
       FROM dbo.RegistrosUso r
       JOIN dbo.Vehiculos v      ON v.id_vehiculo = r.id_vehiculo
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo    = v.id_tipo
       JOIN dbo.Lados l          ON l.id_lado     = r.id_lado
       WHERE r.id_usuario = @uid AND r.estado = 'activo'
       ORDER BY r.fecha_entrada DESC`,
      { uid: usuario.id_usuario }
    );

    return res.json({
      ok: true, usuario,
      vehiculos: vResult.recordset,
      dentro: estadoResult.recordset.length > 0,
      estado_actual: estadoResult.recordset[0] || null,
    });
  } catch (err) { console.error(err); return res.status(500).json({ ok: false, message: 'Error interno.' }); }
});

// ── POST /api/parqueadero/admin-entrada  ─────────────────────────────
router.post('/admin-entrada', requireRol('admin'), async (req, res) => {
  const { id_usuario, id_vehiculo, id_lado } = req.body;
  if (!id_usuario || !id_vehiculo || !id_lado)
    return res.status(400).json({ ok: false, message: 'Faltan parámetros.' });
  try {
    const result = await execute('dbo.sp_RegistrarEntrada', {
      id_usuario: parseInt(id_usuario), id_vehiculo: parseInt(id_vehiculo), id_lado: parseInt(id_lado),
    });
    return res.status(201).json({ ok: true, message: 'Entrada registrada.', id_registro: result.recordset[0]?.id_registro });
  } catch (err) {
    if (err.message?.includes('entrada activa')) return res.status(409).json({ ok: false, message: err.message });
    if (err.message?.includes('cupos')) return res.status(409).json({ ok: false, message: err.message });
    console.error(err); return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/admin-salida  ──────────────────────────────
router.post('/admin-salida', requireRol('admin'), async (req, res) => {
  const { id_usuario } = req.body;
  if (!id_usuario) return res.status(400).json({ ok: false, message: 'id_usuario requerido.' });
  try {
    const result = await execute('dbo.sp_RegistrarSalida', { id_usuario: parseInt(id_usuario) });
    return res.json({ ok: true, message: 'Salida registrada.', id_registro: result.recordset[0]?.id_registro });
  } catch (err) {
    if (err.message?.includes('entrada activa')) return res.status(404).json({ ok: false, message: err.message });
    console.error(err); return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

module.exports = router;
