// src/routes/usuarios.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const { fileTypeFromBuffer } = require("file-type");

const uploadMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Solo JPG, PNG o WEBP."));
  },
});

// Validación adicional por magic bytes (se aplica dentro del handler, después de multer)
async function validarMagicBytes(buffer) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type.mime)) {
    throw new Error("El archivo no es una imagen válida.");
  }
  return type.mime;
}
const { body, validationResult } = require("express-validator");
const { query } = require("../config/db");
const { authMiddleware } = require("../middlewares/auth");

router.use(authMiddleware);

// ── GET /api/usuarios/perfil ──────────────────────────────────────────
router.get("/perfil", async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id_usuario, u.nombre_completo, u.tipo_id, u.numero_id,
              u.email, u.rol, u.qr_code, u.fecha_registro, u.id_centro,
              u.foto_perfil,
              c.nombre AS centro_nombre, c.id_region,
              r.nombre AS region_nombre
       FROM usuarios u
       LEFT JOIN centros_formacion c ON c.id_centro = u.id_centro
       LEFT JOIN regiones r          ON r.id_region = c.id_region
       WHERE u.id_usuario = @uid AND u.activo = true`,
      { uid: req.user.id_usuario },
    );
    if (!result.rows.length)
      return res
        .status(404)
        .json({ ok: false, message: "Usuario no encontrado." });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({
        ok: false,
        message:
          "No se pudo cargar la información del perfil. Estamos trabajando en ello.",
      });
  }
});

// ── PUT /api/usuarios/perfil ──────────────────────────────────────────
router.put(
  "/perfil",
  [
    body("nombre_completo").trim().notEmpty().withMessage("Nombre requerido."),
    // tipo_id y numero_id son opcionales para superadmin (no los tiene en su formulario)
    body("tipo_id")
      .optional({ nullable: true, checkFalsy: true })
      .isIn(["TI", "CC"])
      .withMessage("tipo_id inválido."),
    body("numero_id").optional({ nullable: true, checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res
        .status(400)
        .json({
          ok: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });

    const { nombre_completo, tipo_id, numero_id, id_centro, email } = req.body;
    // El rol NUNCA se actualiza aquí: solo el admin puede cambiarlo desde /auth/admin-register
    // Aceptarlo aquí permitiría que cualquier usuario se auto-asigne admin.

    try {
      // Solo verificar duplicado de numero_id si viene en el body
      if (numero_id) {
        const dup = await query(
          `SELECT id_usuario FROM usuarios WHERE numero_id = @nid AND id_usuario <> @uid`,
          { nid: numero_id, uid: req.user.id_usuario },
        );
        if (dup.rows.length)
          return res
            .status(409)
            .json({
              ok: false,
              message: "Ese número de identificación ya está en uso.",
            });
      }

      // Construir SET dinámico: solo actualizar campos que vienen en el body
      const setClauses = ["nombre_completo = @nombre", "email = @email"];
      const params = {
        nombre: nombre_completo,
        email: email || null,
        uid: req.user.id_usuario,
      };
      if (tipo_id) {
        setClauses.push("tipo_id = @tipo_id");
        params.tipo_id = tipo_id;
      }
      if (numero_id) {
        setClauses.push("numero_id = @nid");
        params.nid = numero_id;
      }
      if (id_centro !== undefined) {
        setClauses.push("id_centro = @centro");
        params.centro = id_centro || null;
      }

      await query(
        `UPDATE usuarios SET ${setClauses.join(", ")} WHERE id_usuario = @uid`,
        params,
      );
      return res.json({ ok: true, message: "Perfil actualizado." });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({
          ok: false,
          message:
            "No se pudo actualizar el perfil. Estamos trabajando en ello.",
        });
    }
  },
);

// ── PUT /api/usuarios/cambiar-password ───────────────────────────────
router.put(
  "/cambiar-password",
  [
    body("password_actual").notEmpty(),
    body("password_nuevo")
      .isLength({ min: 8 })
      .withMessage("Mínimo 8 caracteres."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ ok: false, errors: errors.array() });

    const { password_actual, password_nuevo } = req.body;

    try {
      const result = await query(
        `SELECT password_hash FROM usuarios WHERE id_usuario = @uid`,
        { uid: req.user.id_usuario },
      );
      if (!result.rows.length)
        return res
          .status(404)
          .json({ ok: false, message: "Usuario no encontrado." });

      const valid = await bcrypt.compare(
        password_actual,
        result.rows[0].password_hash,
      );
      if (!valid)
        return res
          .status(401)
          .json({ ok: false, message: "Contraseña actual incorrecta." });

      const hash = await bcrypt.hash(password_nuevo, 10);
      await query(
        `UPDATE usuarios SET password_hash = @hash WHERE id_usuario = @uid`,
        { hash, uid: req.user.id_usuario },
      );
      return res.json({ ok: true, message: "Contraseña actualizada." });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({
          ok: false,
          message:
            "No se pudo actualizar la contraseña. Estamos trabajando en ello.",
        });
    }
  },
);

// ── POST /api/usuarios/foto-perfil ───────────────────────────────────
router.post("/foto-perfil", uploadMem.single("foto"), async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ ok: false, message: "No se recibió ninguna foto." });

  try {
    // Validar el tipo de archivo por magic bytes
    const fileType = await validarMagicBytes(req.file.buffer);
    const ext = fileType.split("/")[1].replace("jpeg", "jpg");
    const fileName = `perfil-${req.user.id_usuario}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("perfiles")
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error("Error subiendo foto de perfil:", uploadError);
      return res
        .status(500)
        .json({
          ok: false,
          message:
            "No se pudo guardar la foto de perfil. Estamos trabajando en ello.",
        });
    }

    const { data: urlData } = supabase.storage
      .from("perfiles")
      .getPublicUrl(fileName);
    const foto_url = urlData.publicUrl;

    // Borrar foto anterior si existe
    const old = await query(
      "SELECT foto_perfil FROM usuarios WHERE id_usuario = @uid",
      { uid: req.user.id_usuario },
    );
    if (old.rows[0]?.foto_perfil) {
      const oldFile = old.rows[0].foto_perfil.split("/").pop();
      await supabase.storage
        .from("perfiles")
        .remove([oldFile])
        .catch(() => {});
    }

    await query(
      "UPDATE usuarios SET foto_perfil = @foto WHERE id_usuario = @uid",
      { foto: foto_url, uid: req.user.id_usuario },
    );

    return res.json({ ok: true, foto_url });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({
        ok: false,
        message:
          "No se pudo cambiar la contraseña. Estamos trabajando en ello.",
      });
  }
});

// ── DELETE /api/usuarios/foto-perfil ─────────────────────────────────
router.delete("/foto-perfil", async (req, res) => {
  try {
    const result = await query(
      "SELECT foto_perfil FROM usuarios WHERE id_usuario = @uid",
      { uid: req.user.id_usuario },
    );
    const foto = result.rows[0]?.foto_perfil;
    if (foto) {
      const fileName = foto.split("/").pop();
      await supabase.storage
        .from("perfiles")
        .remove([fileName])
        .catch(() => {});
      await query(
        "UPDATE usuarios SET foto_perfil = NULL WHERE id_usuario = @uid",
        { uid: req.user.id_usuario },
      );
    }
    return res.json({ ok: true, message: "Foto eliminada." });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({
        ok: false,
        message:
          "No se pudo procesar la solicitud. Estamos trabajando en ello.",
      });
  }
});

module.exports = router;
