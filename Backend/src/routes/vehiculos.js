// src/routes/vehiculos.js ESTE FUNCIONA CADA VEZ QUE EL USUARIO REGISTRA O ELIMINAR UN VEHICULO
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authMiddleware } = require('../middlewares/auth');

// ── Multer config ─────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/vehiculos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${req.user.id_usuario}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Solo imágenes JPG, PNG o WEBP.'));
  },
});

// ── Validación de tipo según rol ──────────────────────────────────────
const TIPOS_POR_ROL = {
  aprendiz: [1],        // solo bicicleta
  funcionario: [2, 3],     // carro, moto
  instructor: [2, 3],
  admin: [1, 2, 3],
};

const TIPO_NOMBRES = { 1: 'bicicleta', 2: 'carro', 3: 'moto' };

router.use(authMiddleware);

// ── GET /api/vehiculos  —  listar mis vehículos ───────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT v.id_vehiculo, tv.nombre AS tipo, v.placa, v.modelo,
              v.color, v.descripcion, v.foto_url, v.fecha_registro
       FROM dbo.Vehiculos v
       JOIN dbo.TiposVehiculo tv ON tv.id_tipo = v.id_tipo
       WHERE v.id_usuario = @uid AND v.activo = 1
       ORDER BY v.fecha_registro DESC`,
      { uid: req.user.id_usuario }
    );
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

// ── POST /api/vehiculos  —  registrar vehículo ────────────────────────
router.post('/',
  upload.single('foto'),
  [
    body('id_tipo').isInt({ min: 1, max: 3 }).withMessage('Tipo de vehículo inválido.'),
    body('color').trim().notEmpty().withMessage('Color requerido.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, errors: errors.array() });
    }

    const { id_tipo, placa, modelo, color, descripcion } = req.body;
    const tipoNum = parseInt(id_tipo);
    const rol = req.user.rol;

    // Validar tipo según rol
    if (!TIPOS_POR_ROL[rol]?.includes(tipoNum)) {
      if (req.file) fs.unlinkSync(req.file.path);
      const permitidos = TIPOS_POR_ROL[rol].map(t => TIPO_NOMBRES[t]).join(', ');
      return res.status(403).json({
        ok: false,
        message: `Tu rol (${rol}) solo permite registrar: ${permitidos}.`,
      });
    }

    // Carro / moto requieren placa
    if (tipoNum !== 1 && !placa?.trim()) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, message: 'La placa es obligatoria para carros y motos.' });
    }

    // Bicicleta requiere modelo
    if (tipoNum === 1 && !modelo?.trim()) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, message: 'El modelo es obligatorio para bicicletas.' });
    }

    const foto_url = req.file
      ? `/uploads/vehiculos/${req.file.filename}`
      : null;

    try {
      const result = await query(
        `INSERT INTO dbo.Vehiculos (id_usuario, id_tipo, placa, modelo, color, descripcion, foto_url)
         OUTPUT INSERTED.id_vehiculo
         VALUES (@uid, @tipo, @placa, @modelo, @color, @desc, @foto)`,
        {
          uid: req.user.id_usuario,
          tipo: tipoNum,
          placa: placa?.trim() || null,
          modelo: modelo?.trim() || null,
          color: color.trim(),
          desc: descripcion?.trim() || null,
          foto: foto_url,
        }
      );
      return res.status(201).json({
        ok: true,
        message: 'Vehículo registrado.',
        id_vehiculo: result.recordset[0].id_vehiculo,
        foto_url,
      });
    } catch (err) {
      if (req.file) fs.unlinkSync(req.file.path);
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Error interno.' });
    }
  }
);

// ── DELETE /api/vehiculos/:id  —  eliminar vehículo ───────────────────
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // Verificar que el vehículo pertenezca al usuario
    const check = await query(
      `SELECT id_vehiculo, foto_url FROM dbo.Vehiculos
       WHERE id_vehiculo = @id AND id_usuario = @uid AND activo = 1`,
      { id, uid: req.user.id_usuario }
    );
    if (!check.recordset.length) {
      return res.status(404).json({ ok: false, message: 'Vehículo no encontrado.' });
    }

    // Soft delete
    await query(
      `UPDATE dbo.Vehiculos SET activo = 0 WHERE id_vehiculo = @id`,
      { id }
    );

    // Eliminar foto si existe
    const foto = check.recordset[0].foto_url;
    if (foto) {
      const filePath = path.join(__dirname, '../..', foto);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    return res.json({ ok: true, message: 'Vehículo eliminado.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error interno.' });
  }
});

module.exports = router;
