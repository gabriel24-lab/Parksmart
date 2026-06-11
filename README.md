# 🅿️ Parksmart

> Sistema web de gestión de parqueaderos para el SENA

Parksmart es una aplicación web que digitaliza y automatiza el control del parqueadero en centros de formación del SENA. Reemplaza los registros manuales en papel por un sistema en línea donde los aprendices registran sus vehículos, los operarios controlan entradas y salidas escaneando códigos QR, y los administradores tienen visibilidad total del parqueadero en tiempo real.

---

## ¿Qué problema resuelve?

Los parqueaderos del SENA manejan decenas o cientos de vehículos al día. Sin un sistema, es difícil saber cuántos cupos quedan disponibles, quién entró y cuándo salió, o si un vehículo no registrado está ocupando un espacio. Parksmart centraliza todo eso en una sola plataforma accesible desde cualquier navegador.

---

## ¿Cómo funciona?

Cada persona tiene un rol dentro del sistema, y cada rol ve una pantalla diferente:

**🎓 Aprendiz**
Se registra con su número de documento del SENA, agrega su vehículo (foto, placa, tipo) y recibe un código QR único. Cuando llega al parqueadero, el operario escanea ese QR para registrar su entrada.

**👷 Operario**
Tiene una vista especial con un escáner QR integrado. Cuando un aprendiz llega, escanea su código y el sistema registra la entrada automáticamente, descuenta un cupo y guarda la hora. Al salir, escanea de nuevo para registrar la salida.

**🔧 Administrador**
Puede ver el historial completo de entradas y salidas, gestionar los usuarios del centro, configurar cuántos cupos tiene cada lado del parqueadero y qué tipos de vehículo se permiten en cada zona.

**⚙️ Superadministrador**
Tiene acceso total al sistema: puede gestionar múltiples centros de formación, regiones y hacer configuraciones globales.

---

## Funcionalidades principales

- **Registro con verificación SENA** — solo pueden crear cuenta quienes están activos en la base de datos del SENA
- **Código QR personal** — cada usuario tiene un QR único vinculado a su identidad
- **Control de cupos en tiempo real** — el sistema muestra cuántos espacios quedan disponibles
- **Historial de accesos** — registro completo de quién entró, con qué vehículo y a qué hora
- **Recuperación de contraseña** — por correo electrónico con código de verificación
- **Foto del vehículo** — cada vehículo registrado puede tener una foto para identificación visual
- **Múltiples tipos de vehículo** — bicicletas, motos, carros y más, con zonas configurables para cada tipo

---

## Capturas / Demo

🌐 **Versión en línea:** [https://parksmart.vercel.app](https://parksmart.vercel.app)

---

## ¿Quiénes participaron?

Proyecto académico desarrollado por aprendices del **SENA** como solución real a una necesidad del centro de formación.

---

## Tecnologías usadas

El proyecto está dividido en dos partes:

- **Frontend** (lo que ve el usuario): páginas web construidas con HTML, CSS y JavaScript
- **Backend** (el servidor que procesa los datos): Node.js con base de datos PostgreSQL alojada en Supabase

Desplegado en **Vercel** (frontend) y **Render** (backend).

---

*Proyecto académico — SENA · 2025*
