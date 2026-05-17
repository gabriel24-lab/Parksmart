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

    const { nombre, modo, capacidad, habilitado = true, tipos } = req.body;

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

    const { nombre, modo, capacidad, habilitado, tipos } = req.body;

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

// ── PUT /api/parqueadero/config/:id_centro/lados/:id_lado/toggle ───────
// Habilitar o deshabilitar un lado
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

module.exports = router;
