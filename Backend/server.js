// server.js — Punto de entrada principal
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit   = require('express-rate-limit');
const { getPool } = require('./src/config/db');

const app  = express();
const PORT = process.env.PORT || 10000;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

// ── Rate limiting ─────────────────────────────────────────────────────
// Login: máximo 10 intentos por IP cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos de inicio de sesión. Espera 15 minutos e intenta de nuevo.' },
  skipSuccessfulRequests: true, // no cuenta los logins exitosos
});

// Recuperación de contraseña: máximo 5 solicitudes por IP cada hora
const recuperarLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes de recuperación. Espera una hora e intenta de nuevo.' },
});

// Registro público: máximo 10 registros por IP cada hora
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes de registro. Espera una hora e intenta de nuevo.' },
});

// General API: máximo 200 requests por IP cada minuto (protege todos los demás endpoints)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' },
});

// ── Trust proxy (Render siempre está detrás de un proxy) ─────────────
// 1 = confiar solo en el primer proxy (el de Render). Necesario para
// que express-rate-limit lea correctamente la IP real del usuario.
app.set('trust proxy', 1);

// ── Compresión gzip (reduce tamaño de respuestas hasta 70%) ───────────
app.use(compression());
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────
const ORIGENES_PERMITIDOS = [
  'https://parksmart.vercel.app', 
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ORIGENES_PERMITIDOS.includes(origin)) return cb(null, true);
    cb(new Error(`Origen no permitido: ${origin}`));
  },
  credentials: true,
}));
// ── Middlewares globales ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Servir archivos estáticos (fotos subidas)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d', // caché de 7 días para imágenes estáticas
}));

// ── Rutas API ─────────────────────────────────────────────────────────
// Limitadores específicos aplicados antes del router general
app.use('/api/auth/login',              loginLimiter);
app.use('/api/auth/recuperar',          recuperarLimiter);
app.use('/api/auth/register',           registerLimiter);
// Limitador general para toda la API
app.use('/api',                         generalLimiter);

app.use('/api/auth',        require('./src/routes/auth'));
app.use('/api/usuarios',    require('./src/routes/usuarios'));
app.use('/api/vehiculos',   require('./src/routes/vehiculos'));
app.use('/api/parqueadero', require('./src/routes/parqueadero'));
app.use('/api/catalogos',   require('./src/routes/catalogos'));

// ── Health check ──────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API Parqueadero SENA funcionando ✅', timestamp: new Date() });
});

// ── 404 ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Ruta no encontrada.' });
});

// ── Error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error no controlado:', err);
  res.status(500).json({ ok: false, message: err.message || 'No se pudo procesar la solicitud.' });
});

// ── Arranque ──────────────────────────────────────────────────────────
async function start() {
  try {
    await getPool();
    app.listen(PORT, () => {
      console.log(`Servidor conectado en http://localhost:${PORT}`);
      console.log(`API disponible en http://localhost:${PORT}/api`);
      if (FRONTEND_URL) console.log(`Frontend permitido: ${FRONTEND_URL}`);
    });
  } catch (err) {
    console.error('No se pudo conectar a Supabase:', err.message);
    process.exit(1);
  }
}

start();
