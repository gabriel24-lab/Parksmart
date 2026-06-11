# 🅿️ Parksmart

Sistema web de gestión inteligente de parqueaderos, desarrollado para el **SENA**. Permite el registro y control de entradas/salidas de vehículos, administración de usuarios y configuración dinámica del parqueadero, todo a través de una interfaz moderna con roles diferenciados.

---

## 🚀 Demo

| Capa | URL |
|------|-----|
| Frontend | [https://parksmart.vercel.app](https://parksmart.vercel.app) |
| Backend API | Desplegado en [Render](https://render.com) |

---

## 📋 Características principales

- **Autenticación segura** con JWT (access token 8h + refresh token 7d)
- **Verificación de identidad SENA** — solo aprendices en formación pueden registrarse
- **Recuperación de contraseña** por email con código OTP (vía SendGrid)
- **Gestión de vehículos** con foto, tipo (bicicleta, moto, carro, etc.) y placa
- **Registro de entradas y salidas** con control de cupos en tiempo real
- **Configuración dinámica del parqueadero**: lados, capacidad, modos y tipos de vehículo permitidos
- **Panel de operario** con escáner QR integrado
- **Panel de superadmin** para administración global de usuarios y centros
- **Rate limiting** por endpoint para protección contra fuerza bruta
- **Subida de imágenes** a Supabase Storage con validación por magic bytes
- **Compresión gzip** y cabeceras de seguridad con Helmet

---

## 🛠️ Stack tecnológico

### Backend
| Tecnología | Uso |
|-----------|-----|
| Node.js + Express | Servidor API REST |
| PostgreSQL (Supabase) | Base de datos principal |
| JWT (jsonwebtoken) | Autenticación y autorización |
| bcryptjs | Hash de contraseñas |
| SendGrid | Envío de emails (bienvenida, recuperación) |
| Multer + Supabase Storage | Subida y almacenamiento de imágenes |
| Helmet + express-rate-limit | Seguridad HTTP |
| Nodemon | Desarrollo en caliente |

### Frontend
| Tecnología | Uso |
|-----------|-----|
| HTML5 / CSS3 / JavaScript vanilla | Interfaz de usuario |
| Vercel | Hosting estático |
| Fuentes: DM Sans, Space Grotesk | Tipografía |

---

## 📁 Estructura del proyecto

```
Parksmart/
├── Backend/
│   ├── server.js               # Punto de entrada, middlewares globales
│   ├── package.json
│   └── src/
│       ├── config/
│       │   ├── db.js           # Conexión a Supabase (PostgreSQL via pg)
│       │   └── mailer.js       # Configuración de SendGrid
│       ├── middlewares/
│       │   └── auth.js         # JWT middleware + control de roles
│       └── routes/
│           ├── auth.js         # Registro, login, recuperación de contraseña
│           ├── usuarios.js     # Perfil, foto, cambio de contraseña
│           ├── vehiculos.js    # CRUD de vehículos con foto
│           ├── parqueadero.js  # Entradas, salidas, historial
│           ├── parqueadero-config.js  # Configuración de lados y cupos
│           └── catalogos.js    # Tipos de vehículo, regiones, centros
├── Frontend/
│   ├── login.html / login.css
│   ├── register.html
│   ├── recuperar.html
│   ├── dashboard.html / dashboard.css
│   ├── operario.html / operario.css
│   ├── superadmin.html
│   └── *.js                    # Lógica de cada vista
├── render.yaml                 # Configuración de despliegue en Render
└── vercel.json                 # Configuración de despliegue en Vercel
```

---

## 👥 Roles de usuario

| Rol | Permisos |
|-----|----------|
| `aprendiz` | Registro de sus propios vehículos, ver historial personal |
| `guardia` / `operario` | Registrar entradas/salidas, escáner QR, ver cupos |
| `admin` | Gestión de usuarios y vehículos del centro |
| `superadmin` | Administración global: centros, regiones, configuración |

---

## ⚙️ Variables de entorno

Crea un archivo `.env` en la carpeta `Backend/` con las siguientes variables:

```env
# Base de datos
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=tu_secreto_aqui
JWT_EXPIRES_IN=8h
JWT_REFRESH_SECRET=tu_refresh_secreto_aqui
JWT_REFRESH_EXPIRES_IN=7d

# Supabase Storage
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=tu_service_key

# SendGrid (emails)
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=no-reply@tudominio.com

# Servidor
PORT=10000
FRONTEND_URL=https://parksmart.vercel.app
MAX_FILE_SIZE=5242880
```

---

## 🏃 Instalación y ejecución local

### Requisitos previos
- Node.js >= 18
- Cuenta en [Supabase](https://supabase.com) con una base de datos PostgreSQL
- Cuenta en [SendGrid](https://sendgrid.com) para el envío de emails

### Pasos

```bash
# 1. Clona el repositorio
git clone https://github.com/tu-usuario/parksmart.git
cd parksmart

# 2. Instala dependencias del backend
cd Backend
npm install

# 3. Crea el archivo .env con tus variables (ver sección anterior)

# 4. Inicia el servidor en modo desarrollo
npm run dev

# El API estará disponible en http://localhost:10000/api
```

Para el frontend, abre los archivos `.html` directamente en el navegador o usa una extensión como **Live Server** en VS Code.

---

## 🌐 Despliegue

### Backend → Render
El archivo `render.yaml` en la raíz del proyecto configura automáticamente el servicio. Solo conecta tu repositorio a Render y define las variables de entorno en su panel.

### Frontend → Vercel
El archivo `vercel.json` enruta todas las peticiones al directorio `Frontend/`. Conecta el repositorio a Vercel y el despliegue es automático en cada push.

---

## 🔒 Seguridad

- Contraseñas hasheadas con **bcryptjs** (salt rounds: 10)
- Tokens JWT con expiración corta (8h) y refresh token (7d)
- **Rate limiting** diferenciado por endpoint:
  - Login: 10 intentos / 15 min por IP
  - Recuperación: 5 solicitudes / hora por IP
  - Registro: 10 solicitudes / hora por IP
  - API general: 200 requests / min por IP
- Cabeceras de seguridad HTTP con **Helmet**
- Validación de imágenes por **magic bytes** (no solo mimetype)
- Validación de inputs con **express-validator**
- CORS restringido a orígenes permitidos

---

## 📄 Licencia

Proyecto académico desarrollado en el **SENA**. Uso educativo.
