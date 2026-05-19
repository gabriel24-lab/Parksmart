// src/routes/parqueadero-config.js
// Gestión dinámica del parqueadero por centro de formación (solo superadmin)
// Endpoints que reemplazan el localStorage del frontend.

const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query, getClient }       = require('../config/db');
const { authMiddleware, requireRol } = require('../middlewares/auth');

router.use(authMiddleware);
router.use(requireRol('superadmin'));

// ── Helpers ────────────────────────────────────────────────────────────

// Devuelve los lados de un centro con tipos permitidos y ocupación actual
async function getLadosCentro(id_centro) {
  const ladosR = await query(
    `SELECT
       l.id_lado,
       l.nombre,
       l.habilitado,
       l.modo,
       l.id_centro,
       COALESCE(l.capacidad, 0)              AS capacidad,
       COALESCE(c.ocupados, 0)               AS ocupados,
       GREATEST(0, COALESCE(l.capacidad,0) - COALESCE(c.ocupados,0)) AS disponibles
     FROM lados l
     LEFT JOIN cupos c ON c.id_lado = l.id_lado
     WHERE l.id_centro = @centro
     ORDER BY l.id_lado`,
    { centro: parseInt(id_centro) }
  );

  const ids = ladosR.rows.map(r => r.id_lado);
  if (!ids.length) return [];

  // Tipos permitidos para todos los lados de una vez
  const tiposR = await query(
    `SELECT ltp.id_lado, tv.id_tipo, tv.nombre
     FROM lados_tipos_permitidos ltp
     JOIN tipos_vehiculo tv ON tv.id_tipo = ltp.id_tipo
     WHERE ltp.id_lado = ANY(@ids)
     ORDER BY tv.id_tipo`,
    { ids }
  );

  const tiposMap = {};
  tiposR.rows.forEach(r => {
    if (!tiposMap[r.id_lado]) tiposMap[r.id_lado] = [];
    tiposMap[r.id_lado].push(r.nombre);
  });

  // Ocupación actual desglosada por tipo
  const ocupR = await query(
    `SELECT r.id_lado, tv.nombre AS tipo, COUNT(*) AS cantidad
     FROM registros_uso r
     JOIN vehiculos      v  ON v.id_vehiculo = r.id_vehiculo
     JOIN tipos_vehiculo tv ON tv.id_tipo    = v.id_tipo
     WHERE r.estado = 'activo'
       AND r.id_lado = ANY(@ids)
     GROUP BY r.id_lado, tv.nombre`,
    { ids }
  );

  const ocupMap = {};
  ocupR.rows.forEach(r => {
    if (!ocupMap[r.id_lado]) ocupMap[r.id_lado] = {};
    ocupMap[r.id_lado][r.tipo.toLowerCase()] = Number(r.cantidad);
  });

  return ladosR.rows.map(l => ({
    id:          l.id_lado,
    nombre:      l.nombre,
    habilitado:  l.habilitado,
    modo:        l.modo,
    id_centro:   l.id_centro,
    capacidad:   l.modo === 'controlado' ? Number(l.capacidad) : null,
    ocupados:    Number(l.ocupados),
    disponibles: Number(l.disponibles),
    tipos:       tiposMap[l.id_lado] || [],
    ocupacion:   ocupMap[l.id_lado]  || {},
  }));
}

// ── GET /api/parqueadero/config/centros ────────────────────────────────
// Lista todos los centros con un resumen de su parqueadero
router.get('/config/centros', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         cf.id_centro,
         cf.nombre,
         COUNT(l.id_lado)                          AS total_lados,
         COUNT(l.id_lado) FILTER (WHERE l.habilitado) AS lados_activos
       FROM centros_formacion cf
       LEFT JOIN lados l ON l.id_centro = cf.id_centro
       GROUP BY cf.id_centro, cf.nombre
       ORDER BY cf.nombre`
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('config/centros:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/config/centros-admin ──────────────────────────
// Lista completa de centros con su región (para la tabla de gestión)
// ⚠️  DEBE ir ANTES de GET /config/:id_centro para que Express no capture
//     "centros-admin" como valor del parámetro :id_centro.
router.get('/config/centros-admin', async (req, res) => {
  try {
    const result = await query(
      `SELECT cf.id_centro, cf.nombre, cf.id_region, r.nombre AS region_nombre,
              COUNT(l.id_lado)                            AS total_lados,
              COUNT(u.id_usuario)                         AS total_usuarios
       FROM centros_formacion cf
       LEFT JOIN regiones       r ON r.id_region  = cf.id_region
       LEFT JOIN lados          l ON l.id_centro  = cf.id_centro
       LEFT JOIN usuarios       u ON u.id_centro  = cf.id_centro
       GROUP BY cf.id_centro, cf.nombre, cf.id_region, r.nombre
       ORDER BY r.nombre, cf.nombre`
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('centros-admin GET:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/config/regiones-admin ─────────────────────────
// Lista de regiones para poblar el select del formulario
// ⚠️  DEBE ir ANTES de GET /config/:id_centro por la misma razón.
router.get('/config/regiones-admin', async (req, res) => {
  try {
    const result = await query(`SELECT id_region, nombre FROM regiones ORDER BY nombre`);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('regiones-admin GET:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── GET /api/parqueadero/config/:id_centro ─────────────────────────────
// Config completa de un centro: lados, tipos permitidos y ocupación real
router.get('/config/:id_centro', async (req, res) => {
  const id_centro = parseInt(req.params.id_centro);
  if (!id_centro) return res.status(400).json({ ok: false, message: 'id_centro inválido.' });

  try {
    const lados = await getLadosCentro(id_centro);
    return res.json({ ok: true, data: { id_centro, lados } });
  } catch (err) {
    console.error('config/get:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/parqueadero/config/:id_centro/lados ──────────────────────
// Agregar un nuevo lado a un centro
router.post('/config/:id_centro/lados',
  [
    body('nombre').trim().notEmpty().withMessage('Nombre requerido.'),
    body('modo').isIn(['controlado','libre']).withMessage('Modo inválido.'),
    body('capacidad').optional({ nullable: true }).isInt({ min: 1, max: 9999 }),
    body('habilitado').optional().isBoolean(),
    body('tipos').isArray({ min: 1 }).withMessage('Selecciona al menos un tipo de vehículo.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    const id_centro = parseInt(req.params.id_centro);
    if (!id_centro) return res.status(400).json({ ok: false, message: 'id_centro inválido.' });

    const { nombre, capacidad, habilitado = true, tipos } = req.body;

    // Sanitizar modo: extraer solo el valor válido sin importar
    // si el frontend envió el texto completo del <option> en lugar del value.
    const modoRaw  = (req.body.modo || '').toString().toLowerCase();
    const modo     = modoRaw.startsWith('controlado') ? 'controlado' : 'libre';

    if (modo === 'controlado' && (!capacidad || Number(capacidad) < 1)) {
      return res.status(400).json({ ok: false, message: 'El modo controlado requiere una capacidad mayor a 0.' });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Verificar que el centro existe
      const centroCheck = await client.query(
        'SELECT id_centro FROM centros_formacion WHERE id_centro = $1', [id_centro]
      );
      if (!centroCheck.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, message: 'Centro de formación no encontrado.' });
      }

      // Resolver ids de tipos (el frontend manda nombres: 'Bicicleta', 'Moto', 'Carro')
      const tiposNombres = Array.isArray(tipos) ? tipos : [];
      const tiposR = await client.query(
        `SELECT id_tipo, nombre FROM tipos_vehiculo WHERE LOWER(nombre) = ANY($1::text[])`,
        [tiposNombres.map(t => t.toLowerCase())]
      );
      if (!tiposR.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, message: 'Ningún tipo de vehículo reconocido.' });
      }

      // Insertar lado
      const insert = await client.query(
        `INSERT INTO lados (nombre, habilitado, modo, capacidad, id_centro)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id_lado`,
        [
          nombre,
          habilitado !== false,
          modo,
          modo === 'controlado' ? Number(capacidad) : null,
          id_centro,
        ]
      );
      const id_lado = insert.rows[0].id_lado;

      // Insertar fila en cupos
      await client.query(
        `INSERT INTO cupos (id_lado, ocupados) VALUES ($1, 0)`,
        [id_lado]
      );

      // Insertar tipos permitidos
      for (const tv of tiposR.rows) {
        await client.query(
          `INSERT INTO lados_tipos_permitidos (id_lado, id_tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id_lado, tv.id_tipo]
        );
      }

      await client.query('COMMIT');

      const lados = await getLadosCentro(id_centro);
      return res.status(201).json({ ok: true, message: `Lado "${nombre}" creado.`, data: { id_centro, lados } });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('config/lados POST:', err);
      return res.status(500).json({ ok: false, message: 'Error interno.' });
    } finally {
      client.release();
    }
  }
);

// ── PUT /api/parqueadero/config/:id_centro/lados/:id_lado/toggle ───────
// Habilitar o deshabilitar un lado
// ⚠️  DEBE ir ANTES del PUT genérico /:id_lado para que Express no capture
//     "toggle" como valor del parámetro :id_lado.
router.put('/config/:id_centro/lados/:id_lado/toggle', async (req, res) => {
  const id_centro = parseInt(req.params.id_centro);
  const id_lado   = parseInt(req.params.id_lado);
  if (!id_centro || !id_lado) return res.status(400).json({ ok: false, message: 'IDs inválidos.' });

  try {
    const check = await query(
      `SELECT id_lado, habilitado, nombre FROM lados WHERE id_lado = @id AND id_centro = @centro`,
      { id: id_lado, centro: id_centro }
    );
    if (!check.rows.length)
      return res.status(404).json({ ok: false, message: 'Lado no encontrado para este centro.' });

    const nuevoEstado = !check.rows[0].habilitado;
    await query(
      `UPDATE lados SET habilitado = @estado WHERE id_lado = @id`,
      { estado: nuevoEstado, id: id_lado }
    );

    const lados = await getLadosCentro(id_centro);
    return res.json({
      ok:        true,
      habilitado: nuevoEstado,
      message:   nuevoEstado
        ? `Lado "${check.rows[0].nombre}" habilitado.`
        : `Lado "${check.rows[0].nombre}" deshabilitado.`,
      data: { id_centro, lados },
    });
  } catch (err) {
    console.error('config/toggle:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── PUT /api/parqueadero/config/:id_centro/lados/:id_lado ──────────────
// Editar nombre, modo, capacidad, tipos y estado de un lado
router.put('/config/:id_centro/lados/:id_lado',
  [
    body('nombre').trim().notEmpty().withMessage('Nombre requerido.'),
    body('modo').isIn(['controlado','libre']).withMessage('Modo inválido.'),
    body('capacidad').optional({ nullable: true }).isInt({ min: 1, max: 9999 }),
    body('habilitado').optional().isBoolean(),
    body('tipos').isArray({ min: 1 }).withMessage('Selecciona al menos un tipo de vehículo.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });

    const id_centro = parseInt(req.params.id_centro);
    const id_lado   = parseInt(req.params.id_lado);
    if (!id_centro || !id_lado) return res.status(400).json({ ok: false, message: 'IDs inválidos.' });

    const { nombre, capacidad, habilitado, tipos } = req.body;

    // Sanitizar modo: extraer solo el valor válido sin importar
    // si el frontend envió el texto completo del <option> en lugar del value.
    const modoRaw  = (req.body.modo || '').toString().toLowerCase();
    const modo     = modoRaw.startsWith('controlado') ? 'controlado' : 'libre';

    if (modo === 'controlado' && (!capacidad || Number(capacidad) < 1)) {
      return res.status(400).json({ ok: false, message: 'El modo controlado requiere una capacidad mayor a 0.' });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Verificar que el lado pertenece al centro
      const check = await client.query(
        `SELECT id_lado FROM lados WHERE id_lado = $1 AND id_centro = $2`,
        [id_lado, id_centro]
      );
      if (!check.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, message: 'Lado no encontrado para este centro.' });
      }

      // Actualizar lado
      await client.query(
        `UPDATE lados
         SET nombre     = $1,
             habilitado = $2,
             modo       = $3,
             capacidad  = $4
         WHERE id_lado = $5`,
        [
          nombre,
          habilitado !== false,
          modo,
          modo === 'controlado' ? Number(capacidad) : null,
          id_lado,
        ]
      );

      // Si cambia a controlado, asegurar que existe fila en cupos
      if (modo === 'controlado') {
        await client.query(
          `INSERT INTO cupos (id_lado, ocupados) VALUES ($1, 0) ON CONFLICT (id_lado) DO NOTHING`,
          [id_lado]
        );
      }

      // Actualizar tipos permitidos: resolver IDs primero (case-insensitive), luego borrar y reinsertar
      const tiposNombres = Array.isArray(tipos) ? tipos : [];
      const tiposR = await client.query(
        `SELECT id_tipo FROM tipos_vehiculo WHERE LOWER(nombre) = ANY($1::text[])`,
        [tiposNombres.map(t => t.toLowerCase())]
      );

      // Si ningún tipo fue reconocido, abortar antes de borrar nada
      if (!tiposR.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, message: 'Ningún tipo de vehículo reconocido. Selecciona al menos uno.' });
      }

      await client.query(
        `DELETE FROM lados_tipos_permitidos WHERE id_lado = $1`, [id_lado]
      );

      for (const tv of tiposR.rows) {
        await client.query(
          `INSERT INTO lados_tipos_permitidos (id_lado, id_tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id_lado, tv.id_tipo]
        );
      }

      await client.query('COMMIT');

      const lados = await getLadosCentro(id_centro);
      return res.json({ ok: true, message: `Lado "${nombre}" actualizado.`, data: { id_centro, lados } });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('config/lados PUT:', err);
      return res.status(500).json({ ok: false, message: 'Error interno.' });
    } finally {
      client.release();
    }
  }
);

// ── DELETE /api/parqueadero/config/:id_centro/lados/:id_lado ───────────
// Eliminar un lado (solo si no tiene registros activos)
router.delete('/config/:id_centro/lados/:id_lado', async (req, res) => {
  const id_centro = parseInt(req.params.id_centro);
  const id_lado   = parseInt(req.params.id_lado);
  if (!id_centro || !id_lado) return res.status(400).json({ ok: false, message: 'IDs inválidos.' });

  try {
    const check = await query(
      `SELECT id_lado, nombre FROM lados WHERE id_lado = @id AND id_centro = @centro`,
      { id: id_lado, centro: id_centro }
    );
    if (!check.rows.length)
      return res.status(404).json({ ok: false, message: 'Lado no encontrado para este centro.' });

    // Verificar si tiene vehículos dentro en este momento
    const activos = await query(
      `SELECT COUNT(*) AS total FROM registros_uso WHERE id_lado = @id AND estado = 'activo'`,
      { id: id_lado }
    );
    if (Number(activos.rows[0].total) > 0) {
      return res.status(409).json({
        ok: false,
        message: `No se puede eliminar "${check.rows[0].nombre}": hay ${activos.rows[0].total} vehículo(s) dentro ahora mismo.`,
      });
    }

    // Eliminar en cascada (tipos_permitidos y cupos se eliminan por ON DELETE CASCADE)
    await query(`DELETE FROM lados WHERE id_lado = @id`, { id: id_lado });

    const lados = await getLadosCentro(id_centro);
    return res.json({
      ok:      true,
      message: `Lado "${check.rows[0].nombre}" eliminado.`,
      data:    { id_centro, lados },
    });
  } catch (err) {
    console.error('config/delete:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// ── CRUD CENTROS DE FORMACIÓN (solo superadmin) ───────────────────────
// ══════════════════════════════════════════════════════════════════════

// Invalida la caché de centros en catalogos.js para que el próximo
// GET /catalogos/centros devuelva datos frescos desde la BD.
const { clearCache: clearCatalogosCache } = require('./catalogos');
function invalidarCacheCatalogos() {
  try {
    // Elimina todas las entradas de centros (con y sin filtro de región)
    // y también la de regiones, por si acaso.
    clearCatalogosCache();
  } catch (e) {
    console.warn('No se pudo invalidar caché de catálogos:', e.message);
  }
}

// ── POST /api/parqueadero/config/centros-admin ─────────────────────────
// Crear un nuevo centro de formación
router.post('/config/centros-admin',
  [
    body('nombre').trim().notEmpty().withMessage('El nombre del centro es requerido.'),
    body('id_region').isInt({ min: 1 }).withMessage('Selecciona una región válida.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const { nombre, id_region } = req.body;

    try {
      // Verificar que la región existe
      const regionCheck = await query(
        `SELECT id_region FROM regiones WHERE id_region = @id`,
        { id: parseInt(id_region) }
      );
      if (!regionCheck.rows.length)
        return res.status(404).json({ ok: false, message: 'La región seleccionada no existe.' });

      // Verificar nombre duplicado en la misma región
      const dupCheck = await query(
        `SELECT id_centro FROM centros_formacion
         WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(@nombre)) AND id_region = @region`,
        { nombre, region: parseInt(id_region) }
      );
      if (dupCheck.rows.length)
        return res.status(409).json({ ok: false, message: 'Ya existe un centro con ese nombre en esa región.' });

      const insert = await query(
        `INSERT INTO centros_formacion (nombre, id_region) VALUES (@nombre, @region) RETURNING id_centro`,
        { nombre: nombre.trim(), region: parseInt(id_region) }
      );

      invalidarCacheCatalogos();
      return res.status(201).json({
        ok: true,
        message: `Centro "${nombre.trim()}" creado correctamente.`,
        data: { id_centro: insert.rows[0].id_centro },
      });
    } catch (err) {
      console.error('centros-admin POST:', err);
      return res.status(500).json({ ok: false, message: 'Error interno.' });
    }
  }
);

// ── PUT /api/parqueadero/config/centros-admin/:id_centro ───────────────
// Editar nombre y/o región de un centro
router.put('/config/centros-admin/:id_centro',
  [
    body('nombre').trim().notEmpty().withMessage('El nombre del centro es requerido.'),
    body('id_region').isInt({ min: 1 }).withMessage('Selecciona una región válida.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, message: errors.array()[0].msg });

    const id_centro = parseInt(req.params.id_centro);
    if (!id_centro) return res.status(400).json({ ok: false, message: 'ID inválido.' });

    const { nombre, id_region } = req.body;

    try {
      // Verificar que el centro existe
      const centroCheck = await query(
        `SELECT id_centro FROM centros_formacion WHERE id_centro = @id`,
        { id: id_centro }
      );
      if (!centroCheck.rows.length)
        return res.status(404).json({ ok: false, message: 'Centro no encontrado.' });

      // Verificar que la región existe
      const regionCheck = await query(
        `SELECT id_region FROM regiones WHERE id_region = @id`,
        { id: parseInt(id_region) }
      );
      if (!regionCheck.rows.length)
        return res.status(404).json({ ok: false, message: 'La región seleccionada no existe.' });

      // Verificar nombre duplicado (excluyendo el propio centro)
      const dupCheck = await query(
        `SELECT id_centro FROM centros_formacion
         WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(@nombre))
           AND id_region = @region
           AND id_centro <> @id`,
        { nombre, region: parseInt(id_region), id: id_centro }
      );
      if (dupCheck.rows.length)
        return res.status(409).json({ ok: false, message: 'Ya existe otro centro con ese nombre en esa región.' });

      await query(
        `UPDATE centros_formacion SET nombre = @nombre, id_region = @region WHERE id_centro = @id`,
        { nombre: nombre.trim(), region: parseInt(id_region), id: id_centro }
      );

      invalidarCacheCatalogos();
      return res.json({ ok: true, message: `Centro actualizado correctamente.` });
    } catch (err) {
      console.error('centros-admin PUT:', err);
      return res.status(500).json({ ok: false, message: 'Error interno.' });
    }
  }
);

// ── DELETE /api/parqueadero/config/centros-admin/:id_centro ────────────
// Eliminar un centro (solo si no tiene usuarios ni lados activos)
router.delete('/config/centros-admin/:id_centro', async (req, res) => {
  const id_centro = parseInt(req.params.id_centro);
  if (!id_centro) return res.status(400).json({ ok: false, message: 'ID inválido.' });

  try {
    const centroCheck = await query(
      `SELECT nombre FROM centros_formacion WHERE id_centro = @id`,
      { id: id_centro }
    );
    if (!centroCheck.rows.length)
      return res.status(404).json({ ok: false, message: 'Centro no encontrado.' });

    const nombre = centroCheck.rows[0].nombre;

    // Bloquear si tiene usuarios asociados
    const usuarios = await query(
      `SELECT COUNT(*) AS total FROM usuarios WHERE id_centro = @id`,
      { id: id_centro }
    );
    if (Number(usuarios.rows[0].total) > 0)
      return res.status(409).json({
        ok: false,
        message: `No se puede eliminar "${nombre}": tiene ${usuarios.rows[0].total} usuario(s) registrado(s).`,
      });

    // Bloquear si tiene lados con vehículos activos
    const activos = await query(
      `SELECT COUNT(*) AS total
       FROM registros_uso ru
       JOIN lados l ON l.id_lado = ru.id_lado
       WHERE l.id_centro = @id AND ru.estado = 'activo'`,
      { id: id_centro }
    );
    if (Number(activos.rows[0].total) > 0)
      return res.status(409).json({
        ok: false,
        message: `No se puede eliminar "${nombre}": hay vehículos dentro del parqueadero ahora mismo.`,
      });

    // Eliminar (los lados y cupos se eliminan por CASCADE si está configurado,
    // si no, eliminamos manualmente en orden)
    await query(`DELETE FROM lados_tipos_permitidos WHERE id_lado IN (SELECT id_lado FROM lados WHERE id_centro = @id)`, { id: id_centro });
    await query(`DELETE FROM cupos  WHERE id_lado IN (SELECT id_lado FROM lados WHERE id_centro = @id)`, { id: id_centro });
    await query(`DELETE FROM lados  WHERE id_centro = @id`, { id: id_centro });
    await query(`DELETE FROM centros_formacion WHERE id_centro = @id`, { id: id_centro });

    invalidarCacheCatalogos();
    return res.json({ ok: true, message: `Centro "${nombre}" eliminado correctamente.` });
  } catch (err) {
    console.error('centros-admin DELETE:', err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

module.exports = router;