// admin-scanner.js — Escáner QR, entrada/salida, registro de usuarios y utilidades
'use strict';

  function startScan() {
    const overlay  = document.getElementById('qr-overlay');
    const status   = document.getElementById('scan-status');
    const btnStart = document.getElementById('btn-start-scan');
    const btnStop  = document.getElementById('btn-stop-scan');
    const btnFlip  = document.getElementById('btn-flip-cam');

    btnStart.style.display = 'none';
    if (btnStop)  btnStop.style.display  = 'inline-flex';
    if (btnFlip)  btnFlip.style.display  = 'inline-flex';
    if (overlay)  overlay.style.display  = 'flex';
    if (status)   status.innerHTML = '<i class="bi bi-camera-video-fill" style="color:#4fc3f7"></i> Iniciando cámara...';

    html5QrcodeScanner = new Html5Qrcode('qr-reader');
    html5QrcodeScanner.start(
      { facingMode: currentFacingMode },
      { fps: 12, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        stopScan();
        processQRResult(decodedText);
      },
      () => {}
    ).then(() => {
      if (status) status.innerHTML = '<i class="bi bi-camera-video-fill" style="color:#69f0ae"></i> Cámara activa — apunta al QR';
    }).catch((err) => {
      console.warn("Camera start error:", err);
      // No llamar a stopScan() aquí porque falló al iniciar y no está escaneando
      if (currentFacingMode === 'environment') {
        currentFacingMode = 'user';
        showToast('Cámara trasera no disponible, activando frontal...', 'info');
        setTimeout(startScan, 300);
      } else {
        if (status) status.innerHTML = '<i class="bi bi-camera-video-off" style="color:#ef9a9a"></i> Sin acceso a cámara';
        showToast('Otorga permisos de cámara en tu navegador o sube la imagen.', 'error');
        currentFacingMode = 'environment';
      }
    });
  }

  function stopScan() {
    const overlay  = document.getElementById('qr-overlay');
    const status   = document.getElementById('scan-status');
    const btnStart = document.getElementById('btn-start-scan');
    const btnStop  = document.getElementById('btn-stop-scan');
    const btnFlip  = document.getElementById('btn-flip-cam');

    if (html5QrcodeScanner) {
      html5QrcodeScanner.stop().catch(() => {});
      html5QrcodeScanner = null;
    }
    btnStart.style.display = 'inline-flex';
    if (btnStop)  btnStop.style.display  = 'none';
    if (btnFlip)  btnFlip.style.display  = 'none';
    if (overlay)  overlay.style.display  = 'none';
    if (status)   status.innerHTML = '<i class="bi bi-camera-video-off"></i> Cámara inactiva';
  }

  function flipCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    if (html5QrcodeScanner) { stopScan(); setTimeout(startScan, 300); }
    else startScan();
  }

  function scanFromFile(input) {
    const file = input.files[0];
    if (!file) return;
    const content = document.getElementById('scan-result-content');
    content.innerHTML = `<div class="result-loading"><i class="bi bi-hourglass-split"></i> Leyendo imagen QR...</div>`;
    
    // Html5Qrcode es una clase, debe usarse como instancia para leer archivos
    const scanner = new Html5Qrcode('qr-reader');
    scanner.scanFile(file, true)
      .then(decodedText => { input.value = ''; processQRResult(decodedText); })
      .catch((err) => {
        console.warn("Scan file error:", err);
        input.value = '';
        content.innerHTML = `
          <div class="result-error">
            <i class="bi bi-x-circle-fill"></i>
            <strong>No se detectó QR en la imagen</strong>
            <span>Asegúrate de que el código sea claro y no esté recortado</span>
          </div>`;
      });
  }

  function processManual() {
    const id = document.getElementById('manual-id').value.trim();
    if (!id) return;
    processQRResult(id);
  }

async function processQRResult(rawText) {
  const content = document.getElementById('scan-result-content');
  content.innerHTML = `<div class="result-loading"><i class="bi bi-hourglass-split"></i> Buscando usuario...</div>`;

  // El QR puede ser JSON (nuevo formato) o texto plano (formato viejo)
  let qr_code = rawText;
  try {
    const parsed = JSON.parse(rawText);
    qr_code = parsed.qr_code;   // extraer el qr_code del JSON
  } catch (e) {
    // era texto plano, usar tal cual
  }

  try {
    const res = await apiFetch('/parqueadero/escanear', {
      method: 'POST',
      body: JSON.stringify({ qr_code }),
    });
    const data = await res.json();

    if (!data.ok) {
      content.innerHTML = `
        <div class="result-error">
          <i class="bi bi-x-circle-fill"></i>
          <strong>Usuario no encontrado</strong>
          <span>QR: ${qr_code}</span>
        </div>`;
      return;
    }

    showScanResult(data);
  } catch (e) {
    content.innerHTML = `<div class="result-error"><i class="bi bi-wifi-off"></i> Error de conexión</div>`;
  }
}

  // Vehículo actualmente seleccionado en el scanner (para actualizar foto al cambiar)
  let _scanVehiculos = [];
  let _scanUsuario   = null;
  let _scanDentro    = false;

  function showScanResult(data) {
    const { usuario, vehiculos, dentro, estado_actual } = data;
    _scanVehiculos = vehiculos;
    _scanUsuario   = usuario;
    _scanDentro    = dentro;

    const content    = document.getElementById('scan-result-content');
    const ROL_LABELS = { aprendiz:'Aprendiz', funcionario:'Funcionario', instructor:'Instructor', admin:'Administrador' };
    const initials   = usuario.nombre_completo.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const idMask     = '*'.repeat(Math.max(0, String(usuario.numero_id).length - 4)) + String(usuario.numero_id).slice(-4);

    // Selector de vehículo: solo aparece si hay 2 o más
    const selectorHTML = vehiculos.length >= 2
      ? `<div class="scan-veh-selector">
          ${vehiculos.map((v, i) => `
            <button class="scan-veh-btn ${i === 0 ? 'active' : ''}"
              onclick="switchScanVehiculo(${i})" data-idx="${i}">
              <span class="scan-veh-type">${v.tipo}</span>
              ${v.placa || v.modelo || v.color || '—'}
            </button>`).join('')}
         </div>`
      : '';

    // Estado + info adicional si está dentro
    const estadoHTML = `
      <div class="scan-status-row">
        Estado: <span class="event-badge ${dentro ? 'in' : 'out'}">${dentro ? 'Dentro' : 'Fuera'}</span>
        ${estado_actual
          ? `<span class="scan-status-extra">· ${estado_actual.lado} · desde ${
              fechaColombia(estado_actual.fecha_entrada)
                .toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota' })
            }</span>`
          : ''}
      </div>`;

    content.innerHTML = `
      <div class="scan-result-wrap">

        ${selectorHTML}

        <div class="scan-foto-wrap" id="scan-foto-wrap">
          ${buildFotoHTML(vehiculos[0] || null)}
        </div>

        <div class="scan-user-body">
          ${usuario.foto_perfil
            ? `<div style="text-align:center;padding:12px 0 4px;">
                <img src="${usuario.foto_perfil}" alt="Foto de perfil" class="result-av-foto"/>
               </div>`
            : ''
          }
          <div class="scan-user-row">
            ${!usuario.foto_perfil
              ? `<div class="result-av">${initials}</div>`
              : ''
            }
            <div class="scan-user-info" style="${usuario.foto_perfil ? 'text-align:center;align-items:center;width:100%' : ''}">
              <div class="result-name">${usuario.nombre_completo}</div>
              <div class="scan-meta-row">
                <span><i class="bi bi-fingerprint"></i> ${usuario.tipo_id} ${idMask}</span>
                <span class="scan-rol-chip scan-rol-${usuario.rol}">${ROL_LABELS[usuario.rol] || usuario.rol}</span>
              </div>
              ${usuario.centro_nombre
                ? `<div class="scan-centro"><i class="bi bi-building"></i> ${usuario.centro_nombre}</div>`
                : ''}
            </div>
          </div>

          ${estadoHTML}

          <div class="result-action-btns" id="action-btns-area">
            ${buildActionButtons(usuario, vehiculos, dentro)}
          </div>
        </div>

      </div>`;
  }

  // HTML de la foto para un vehículo — con fallback elegante si no hay foto
  function buildFotoHTML(veh) {
    if (!veh) return `
      <div class="scan-foto-placeholder">
        <i class="bi bi-car-front" style="font-size:2.4rem;opacity:.15;"></i>
        <span>Sin vehículos registrados</span>
      </div>`;

    const label = [veh.tipo, veh.placa || veh.modelo || veh.color].filter(Boolean).join(' ');

    if (veh.foto_url) {
      // Escapar comillas para el onerror inline
      const fallbackLabel = label.replace(/'/g, "\'");
      return `
        <img src="${veh.foto_url}" alt="${label}"
          onerror="this.parentElement.innerHTML=buildFotoHTML({tipo:'${veh.tipo}',placa:'${(veh.placa||'').replace(/'/g,"\'")}',modelo:'${(veh.modelo||'').replace(/'/g,"\'")}',color:'${(veh.color||'').replace(/'/g,"\'")}',foto_url:null})"
          style="width:100%;height:100%;object-fit:cover;display:block;" />
        <div class="scan-foto-label">${label}</div>`;
    }

    return `
      <div class="scan-foto-placeholder">
        <i class="bi bi-image" style="font-size:2.4rem;opacity:.15;"></i>
        <span>Sin foto del vehículo</span>
      </div>
      <div class="scan-foto-label">${label}</div>`;
  }

  // Cambia el vehículo activo: actualiza botones y foto
  function switchScanVehiculo(idx) {
    // 1. Actualizar botones visuales de arriba
    document.querySelectorAll('.scan-veh-btn').forEach((b, i) => b.classList.toggle('active', i === idx));

    // 2. Actualizar la foto
    const wrap = document.getElementById('scan-foto-wrap');
    if (wrap && _scanVehiculos[idx]) wrap.innerHTML = buildFotoHTML(_scanVehiculos[idx]);

    // 3. Sincronizar el select de abajo para que adminEntrada() tome el vehículo correcto
    if (_scanUsuario) {
      const sel = document.getElementById('sel-vehiculo-' + _scanUsuario.id_usuario);
      if (sel) sel.selectedIndex = idx;
    }
  }

function buildActionButtons(usuario, vehiculos, dentro) {
    if (dentro) {
      return `<button class="btn-exit" onclick="adminSalida(${usuario.id_usuario})">
        <i class="bi bi-arrow-up-circle-fill"></i> Registrar Salida
      </button>`;
    }
    if (vehiculos.length === 0) {
      return `<div style="opacity:.6;font-size:.85rem;padding:8px 0;">Sin vehículos para registrar entrada.</div>`;
    }
    // Con 2+ vehículos, el selector de foto ya muestra cuál está activo.
    // Aquí el select sincroniza con el selector visual usando onchange.
    const optsVeh = vehiculos.map((v, i) => {
      const label = `${v.tipo} ${v.placa || v.modelo || v.color || ''}`.trim();
      return `<option value="${v.id_vehiculo}">${label}</option>`;
    }).join('');
    return `
      <div class="scan-action-row">
        <select id="sel-vehiculo-${usuario.id_usuario}"
          onchange="syncScanVehSelector(this)"
          style="flex:2;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:inherit;font-size:13px;">
          ${optsVeh}
        </select>
        <select id="sel-lado-${usuario.id_usuario}"
          style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:inherit;font-size:13px;">
          <option value="1">Lado A (controlado)</option>
          <option value="2">Lado B (abierto)</option>
        </select>
      </div>
      <button class="btn-entry" onclick="adminEntrada(${usuario.id_usuario}, '${usuario.id_usuario}')">
        <i class="bi bi-arrow-down-circle-fill"></i> Registrar Entrada
      </button>`;
  }

  // Sincroniza el select de vehículo con los botones visuales del selector
  function syncScanVehSelector(selectEl) {
    const idx = selectEl.selectedIndex;
    switchScanVehiculo(idx);
  }

async function adminEntrada(id_usuario, uid_key) {
  const key = uid_key || id_usuario;
  const id_vehiculo = (document.getElementById('sel-vehiculo-' + key) || document.getElementById('sel-vehiculo'))?.value;
  const id_lado     = (document.getElementById('sel-lado-' + key)     || document.getElementById('sel-lado'))?.value || '1';
  try {
    const res  = await apiFetch('/parqueadero/admin-entrada', {
      method: 'POST',
      body: JSON.stringify({ id_usuario, id_vehiculo, id_lado }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.message, 'error'); return; }
    showToast('Entrada registrada ✓');
    await cargarCuposDesdeAPI();
    await cargarUsuariosDesdeAPI();
    await cargarRecientesDesdeAPI();
    document.getElementById('scan-result-content').innerHTML = `
      <div class="result-success">
        <i class="bi bi-check-circle-fill"></i>
        <strong>Entrada registrada correctamente</strong>
      </div>`;
  } catch { showToast('Error de conexión', 'error'); }
}

async function adminSalida(id_usuario) {
  try {
    const res  = await apiFetch('/parqueadero/admin-salida', {
      method: 'POST',
      body: JSON.stringify({ id_usuario }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.message, 'error'); return; }
    showToast('Salida registrada ✓');
    await cargarCuposDesdeAPI();
    await cargarUsuariosDesdeAPI();
    await cargarRecientesDesdeAPI();
    document.getElementById('scan-result-content').innerHTML = `
      <div class="result-success">
        <i class="bi bi-check-circle-fill"></i>
        <strong>Salida registrada correctamente</strong>
      </div>`;
  } catch { showToast('Error de conexión', 'error'); }
}

  function registerEvent(userId, tipo) {
    const u = usuarios.find(x => x.id === userId);
    if (u) {
      if (tipo === 'entrada') { u.estado = 'Dentro'; cuposOcupados = Math.min(cuposOcupados + 1, cuposTotal); }
      else                    { u.estado = 'Fuera';  cuposOcupados = Math.max(cuposOcupados - 1, 0); }
      updateCuposUI();
      renderUsersTable(usuarios);
      addRecentActivity(u, tipo === 'entrada' ? 'in' : 'out');
    }
    showToast(`${tipo.charAt(0).toUpperCase()+tipo.slice(1)} registrada ✓`);
    document.getElementById('scan-result-content').innerHTML = `
      <div class="result-success">
        <i class="bi bi-check-circle-fill"></i>
        <strong>${tipo.charAt(0).toUpperCase()+tipo.slice(1)} registrada correctamente</strong>
      </div>`;
    document.getElementById('manual-id').value = '';
  }

  // ══ ACTIVIDAD RECIENTE ══
  function addRecentActivity(u, tipo, lado) {
    const now = new Date();
    const time = now.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota' });
    const vtag = u.vehiculo==='Carro'?'car':u.vehiculo==='Moto'?'moto':'bike';
    const ladoStr = lado || (u.ladoActual || 'A');
    const badgeLado = `<span class="side-badge ${ladoStr.toLowerCase()}">${ladoStr}</span>`;

    // Tabla global
    const tbody = document.getElementById('recent-tbody');
    if (tbody) {
      const row = `<tr><td>${u.nombre}</td><td>${u.id}</td><td><span class="vtag ${vtag}">${u.vehiculo}</span></td><td>${time}</td><td>${badgeLado}</td><td><span class="event-badge ${tipo==='in'?'in':'out'}">${tipo==='in'?'Entrada':'Salida'}</span></td></tr>`;
      tbody.insertAdjacentHTML('afterbegin', row);
      if (tbody.children.length > 8) tbody.removeChild(tbody.lastChild);
    }
    // Tabla lado A
    if (ladoStr === 'A') {
      const tbodyA = document.getElementById('recent-tbody-A');
      if (tbodyA) {
        const rowA = `<tr><td>${u.nombre}</td><td><span class="vtag ${vtag}">${u.vehiculo}</span></td><td>${time}</td><td><span class="event-badge ${tipo==='in'?'in':'out'}">${tipo==='in'?'Entrada':'Salida'}</span></td></tr>`;
        tbodyA.insertAdjacentHTML('afterbegin', rowA);
        if (tbodyA.children.length > 8) tbodyA.removeChild(tbodyA.lastChild);
      }
    }
    // Tabla lado B
    if (ladoStr === 'B') {
      const tbodyB = document.getElementById('recent-tbody-B');
      if (tbodyB) {
        const rolTag = u.rol || 'Funcionario';
        const rowB = `<tr><td>${u.nombre}</td><td><span class="vtag car">${rolTag}</span></td><td>${time}</td><td><span class="event-badge ${tipo==='in'?'in':'out'}">${tipo==='in'?'Entrada':'Salida'}</span></td></tr>`;
        tbodyB.insertAdjacentHTML('afterbegin', rowB);
        if (tbodyB.children.length > 8) tbodyB.removeChild(tbodyB.lastChild);
      }
    }
  }

  // ══ QR USUARIO ══
  function showUserQR(id, nombre) {
    const modal = document.getElementById('qr-modal');
    const info = document.getElementById('modal-user-info');
    info.innerHTML = `
      <div class="modal-name">${nombre}</div>
      <div class="modal-qr-wrap"><canvas id="modal-qr-canvas"></canvas></div>
      <div class="modal-id-tag"><i class="bi bi-fingerprint"></i> ${id}</div>`;
    modal.style.display = 'flex';
    setTimeout(() => {
      QRCode.toCanvas(document.getElementById('modal-qr-canvas'), id, {
        width: 180, margin: 1,
        color: { dark:'#0d2d55', light:'#ffffff' }
      });
    }, 80);
    document.getElementById('modal-actions').innerHTML = `
      <button class="btn-save" onclick="downloadModalQR()"><i class="bi bi-download"></i> Descargar</button>`;
  }

  function downloadModalQR() {
    const canvas = document.getElementById('modal-qr-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'qr-usuario.png';
    link.href = canvas.toDataURL();
    link.click();
  }

  function closeModal() {
    document.getElementById('qr-modal').style.display = 'none';
  }

  // ══ REGISTRAR USUARIO ══
  let regVehicleType = 'ninguno';
  function setRegVehicle(type, btn) {
    regVehicleType = type;
    document.querySelectorAll('.vehicle-tabs .vtab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['ninguno','carro','moto','bicicleta'].forEach(t => {
      const el = document.getElementById('reg-form-' + t);
      if (el) el.style.display = t === type ? 'block' : 'none';
    });
    // Mostrar opción de registrar entrada solo si hay un vehículo seleccionado
    const entradaWrap = document.getElementById('reg-entrada-wrap');
    if (entradaWrap) entradaWrap.style.display = type !== 'ninguno' ? 'block' : 'none';
    if (type === 'ninguno') {
      const cb = document.getElementById('reg-con-entrada');
      if (cb) cb.checked = false;
      const ladoWrap = document.getElementById('reg-entrada-lado-wrap');
      if (ladoWrap) ladoWrap.style.display = 'none';
    }
  }

  // Mostrar/ocultar selector de lado al marcar el checkbox
  document.addEventListener('DOMContentLoaded', () => {
    const cb = document.getElementById('reg-con-entrada');
    if (!cb) return;
    cb.addEventListener('change', () => {
      const ladoWrap = document.getElementById('reg-entrada-lado-wrap');
      if (ladoWrap) ladoWrap.style.display = cb.checked ? 'block' : 'none';
    });
  });

  async function registrarUsuario() {
    const nombre = document.getElementById('reg-nombre').value.trim();
    const tipoId = document.getElementById('reg-tipo-id').value;
    const numId  = document.getElementById('reg-num-id').value.trim();
    const centro = document.getElementById('reg-centro').value || null;
    const email  = document.getElementById('reg-email').value.trim();
    const rol    = document.getElementById('reg-rol').value;
    // La contraseña temporal es automáticamente el número de identificación
    const pass   = numId;

    if (!nombre || !tipoId || !numId) {
      showToast('Completa nombre, tipo de ID y número de identificación.', 'error');
      return;
    }

    const btn = document.querySelector('#section-registrar .btn-save');
    try {
      if (btn) { btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Creando cuenta...'; btn.disabled = true; }

      // ── PASO 1: Crear usuario ─────────────────────────────────────────
      const res = await apiFetch('/auth/admin-register', {
        method: 'POST',
        body: JSON.stringify({
          nombre_completo: nombre, tipo_id: tipoId, numero_id: numId,
          id_centro: centro ? parseInt(centro) : null,
          email: email || null, password: pass, rol
        })
      });
      const data = await res.json();

      if (!data.ok) {
        showToast(data.message || 'Error al registrar usuario.', 'error');
        if (btn) { btn.innerHTML = '<i class="bi bi-person-check-fill"></i> Registrar usuario'; btn.disabled = false; }
        return;
      }

      const id_usuario = data.id_usuario;
      showToast(`✓ Usuario "${nombre}" creado. Contraseña temporal: ${numId}`, 'success');

      // ── PASO 2: Registrar vehículo si se seleccionó uno ──────────────
      let id_vehiculo = null;
      if (regVehicleType !== 'ninguno' && id_usuario) {
        if (btn) btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Registrando vehículo...';
        const mapTipoId = { carro: 3, moto: 2, bicicleta: 1 };
        let vehiculoBody = { id_tipo: mapTipoId[regVehicleType], id_usuario };

        if (regVehicleType === 'bicicleta') {
          const modelo = document.getElementById('rv-modelo-b').value.trim();
          const color  = document.getElementById('rv-color-b').value.trim();
          const desc   = document.getElementById('rv-desc-b').value.trim();
          if (!modelo || !color) { showToast('Para la bicicleta completa modelo y color.', 'error'); if (btn) { btn.innerHTML = '<i class="bi bi-person-check-fill"></i> Registrar usuario'; btn.disabled = false; } return; }
          vehiculoBody = { ...vehiculoBody, modelo, color, descripcion: desc || null };
        } else {
          const placa = document.getElementById(`rv-placa-${regVehicleType[0]}`).value.trim();
          const color = document.getElementById(`rv-color-${regVehicleType[0]}`).value.trim();
          const desc  = document.getElementById(`rv-desc-${regVehicleType[0]}`).value.trim();
          if (!placa || !color) { showToast(`Para el ${regVehicleType} completa placa y color.`, 'error'); if (btn) { btn.innerHTML = '<i class="bi bi-person-check-fill"></i> Registrar usuario'; btn.disabled = false; } return; }
          vehiculoBody = { ...vehiculoBody, placa, color, descripcion: desc || null };
        }

        const resV = await apiFetch('/vehiculos/admin', {
          method: 'POST',
          body: JSON.stringify(vehiculoBody)
        });
        const dataV = await resV.json();

        if (!dataV.ok) {
          showToast('Usuario creado pero error al registrar vehículo: ' + (dataV.message || ''), 'error');
        } else {
          id_vehiculo = dataV.id_vehiculo;
          setTimeout(() => showToast(`✓ Vehículo registrado (ID: ${id_vehiculo})`, 'success'), 800);
        }
      }

      // ── PASO 3: Registrar entrada si el checkbox está activo ─────────
      const conEntrada = document.getElementById('reg-con-entrada')?.checked;
      if (conEntrada && id_vehiculo && id_usuario) {
        if (btn) btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Registrando entrada...';
        const id_lado = parseInt(document.getElementById('reg-entrada-lado').value || '1');

        const resE = await apiFetch('/parqueadero/admin-entrada', {
          method: 'POST',
          body: JSON.stringify({ id_usuario, id_vehiculo, id_lado })
        });
        const dataE = await resE.json();

        if (!dataE.ok) {
          setTimeout(() => showToast('Vehículo registrado pero error en la entrada: ' + (dataE.message || ''), 'error'), 1600);
        } else {
          setTimeout(() => showToast('✓ Entrada registrada correctamente', 'success'), 1600);
        }
      }

      // ── Limpiar formulario ───────────────────────────────────────────
      ['reg-nombre','reg-num-id','reg-email'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      document.getElementById('reg-tipo-id').value = '';
      document.getElementById('reg-rol').value = 'aprendiz';
      // Reset vehículo a "Sin vehículo"
      const btnNinguno = document.querySelector('.vehicle-tabs .vtab');
      if (btnNinguno) setRegVehicle('ninguno', btnNinguno);

      await cargarUsuariosDesdeAPI();

    } catch(e) {
      console.error('registrarUsuario error:', e);
      showToast('Error de conexión.', 'error');
    }
    if (btn) { btn.innerHTML = '<i class="bi bi-person-check-fill"></i> Registrar usuario'; btn.disabled = false; }
  }

  // ══ PERFIL ADMIN ══
  function updateAdminAvatar(nombre) {
    const parts = nombre.trim().split(' ').filter(Boolean);
    const initials = parts.length >= 2 ? (parts[0][0]+parts[1][0]).toUpperCase() : (parts[0]?parts[0][0].toUpperCase():'A');
    document.getElementById('admin-avatar').textContent = initials;
    document.getElementById('admin-display-name').textContent = nombre || 'Administrador';
  }

  function filterCentrosReg()   { fillCentroSelect('reg-region', 'reg-centro'); }
  function filterCentrosAdmin() { fillCentroSelect('a-region', 'a-centro'); }

  function fillCentroSelect(regionId, selectId) {
    const idRegion = document.getElementById(regionId).value;
    const sel      = document.getElementById(selectId);
    sel.innerHTML  = '<option value="">Selecciona un centro</option>';
    if (!idRegion) return;
    
    const filtrados = centrosSENA.filter(c => c.id_region == idRegion);
    filtrados.forEach(c => {
      const o = document.createElement('option'); 
      o.value = c.id_centro; 
      o.textContent = c.nombre; 
      sel.appendChild(o);
    });
  }

  async function saveAdminProfile() {
    const btn = document.querySelector('#section-perfil .btn-save');
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Guardando...';
    
    const nombre_completo = document.getElementById('a-nombre').value.trim();
    const email = document.getElementById('a-email').value.trim();
    const tipo_id = document.getElementById('a-tipo-id').value;
    const numero_id = document.getElementById('a-num-id').value.trim();
    const id_centro = document.getElementById('a-centro').value || null;

    if (!nombre_completo || !tipo_id || !numero_id) {
      showToast('Nombre e Identificación son requeridos', 'error');
      btn.innerHTML = oldText;
      return;
    }

    try {
      const res = await apiFetch('/usuarios/perfil', {
        method: 'PUT',
        body: JSON.stringify({ 
          nombre_completo, 
          email,
          tipo_id, 
          numero_id, 
          id_centro: id_centro ? parseInt(id_centro) : null 
        })
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.message || 'Error al guardar el perfil.', 'error');
        btn.innerHTML = oldText;
      } else {
        btn.innerHTML = '<i class="bi bi-check-lg"></i> ¡Guardado!';
        btn.style.background = '#1b5e20';
        updateAdminAvatar(nombre_completo);
        showToast('Perfil actualizado correctamente.', 'info');
      }
    } catch(e) {
      showToast('Error de conexión', 'error');
      btn.innerHTML = oldText;
    }
    setTimeout(() => { btn.innerHTML = '<i class="bi bi-check2-circle"></i> Guardar cambios'; btn.style.background = ''; }, 2200);
  }

  async function changeAdminPassword() {
    const actual = document.getElementById('a-pass-act').value;
    const nuevo = document.getElementById('a-pass-new').value;
    if (!actual || !nuevo) { showToast('Completa ambos campos de contraseña.', 'error'); return; }
    if (nuevo.length < 8) { showToast('La nueva contraseña debe tener al menos 8 caracteres.', 'error'); return; }

    try {
      const res = await apiFetch('/usuarios/cambiar-password', {
        method: 'PUT',
        body: JSON.stringify({ password_actual: actual, password_nuevo: nuevo })
      });
      const data = await res.json();
      
      if (!data.ok) { 
         showToast(data.message || (data.errors && data.errors[0].msg) || 'Error al cambiar contraseña.', 'error'); 
         return; 
      }
      document.getElementById('a-pass-act').value = '';
      document.getElementById('a-pass-new').value = '';
      showToast('Contraseña actualizada correctamente.', 'info');
    } catch {
      showToast('Error de conexión.', 'error');
    }
  }

  // ════════ LOGOUT ════════
  async function handleLogout() {
    try {
      if (typeof Auth !== 'undefined' && Auth.getRefreshToken) {
        await apiFetch('/auth/logout', { 
          method: 'POST', 
          body: JSON.stringify({ refresh_token: Auth.getRefreshToken() }) 
        });
        Auth.clear();
      }
    } catch (e) { }
    window.location.href = 'login.html';
  }

  // ══ VEHÍCULO ADMIN ══
  function setAdminVehicle(type, btn) {
    document.querySelectorAll('#section-vehiculo .vtab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['carro','moto','bicicleta'].forEach(t => {
      document.getElementById('av-form-' + t).style.display = t === type ? 'block' : 'none';
    });
  }

  async function saveAdminVehicle(tipo) {
    const btn = event.currentTarget;
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Guardando...';

    const formData = new FormData();
    const isBici = tipo === 'bicicleta';
    const idTipo = tipo === 'carro' ? 3 : tipo === 'moto' ? 2 : tipo === 'furgoneta' ? 4 : 1;
    
    formData.append('id_tipo', idTipo);
    const pre = tipo === 'carro' ? 'c' : tipo === 'moto' ? 'm' : 'b';
    
    // Extracción de datos según placeholders
    const inputs = document.querySelectorAll(`#av-form-${tipo} input[type="text"]`);
    if (!isBici) {
      const placa = inputs[0].value.trim();
      if (!placa) { showToast('La placa es obligatoria', 'error'); btn.innerHTML=oldText; return; }
      formData.append('placa', placa);
    } else {
      const modelo = inputs[0].value.trim();
      if (!modelo) { showToast('El modelo es obligatorio', 'error'); btn.innerHTML=oldText; return; }
      formData.append('modelo', modelo);
    }
    
    const color = inputs[1].value.trim();
    if (!color) { showToast('El color es obligatorio', 'error'); btn.innerHTML=oldText; return; }
    formData.append('color', color);
    
    const desc = document.querySelector(`#av-form-${tipo} textarea`).value.trim();
    if (desc) formData.append('descripcion', desc);
    
    const fileInput = document.getElementById(`av-foto-${pre}`);
    if (fileInput && fileInput.files[0]) {
      formData.append('foto', fileInput.files[0]);
    }

    try {
      const res = await fetch('/api/vehiculos', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
        body: formData
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.message || 'Error al guardar.', 'error');
      } else {
        showToast('Vehículo registrado exitosamente ✓', 'info');
        btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardado';
        btn.style.background = '#1b5e20';
        inputs[0].value = ''; inputs[1].value = '';
        document.querySelector(`#av-form-${tipo} textarea`).value = '';
        const prev = document.getElementById(`av-preview-${pre}`);
        if(prev) { prev.src=''; prev.style.display='none'; }
        if(fileInput) fileInput.value='';
      }
    } catch { showToast('Error de conexión', 'error'); }
    setTimeout(() => { btn.innerHTML = oldText; btn.style.background = ''; }, 2500);
  }

  // ══ NAVEGACIÓN ══
  function showSection(name, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('section-' + name).classList.add('active');
    if (btn) btn.classList.add('active');
    else {
      const navBtn = document.querySelector(`.nav-item[onclick*="'${name}'"]`);
      if (navBtn) navBtn.classList.add('active');
    }
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
    if (name !== 'scanner') stopScan();
    if (name === 'historia') initHistorialAdmin();
  }

  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
  }

  // ══ TOGGLE PASSWORD ══
  function togglePass(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon  = document.getElementById(iconId);
    if (input.type === 'password') { input.type = 'text';     icon.classList.replace('bi-eye','bi-eye-slash'); }
    else                           { input.type = 'password'; icon.classList.replace('bi-eye-slash','bi-eye'); }
  }

  // ══ PREVIEW IMAGEN ══
  function previewImage(input, previewId) {
    const preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
      reader.readAsDataURL(input.files[0]);
    }
  }

  // ══ TOAST ══
  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    // Ícono según tipo
    const icons = {
      error:   'bi-x-circle-fill',
      success: 'bi-check-circle-fill',
      info:    'bi-info-circle-fill',
      warning: 'bi-exclamation-triangle-fill',
    };
    const icon = icons[type] || icons.success;
    t.innerHTML = `<i class="bi ${icon}" style="margin-right:7px;font-size:1.05em;"></i>${msg}`;
    // Quitar clases anteriores y aplicar la nueva
    t.className = 'toast-msg';
    t.classList.add('show', `toast-${type}`);
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => {
      t.classList.remove('show');
    }, type === 'error' ? 5000 : 3500);
  }

  // ════════ UTILIDAD ZONA HORARIA COLOMBIA (UTC-5) ════════
  // El backend ahora envía las fechas como ISO strings con zona horaria de Colombia.
  // Esta función simplemente parsea el ISO string y lo interpreta correctamente.
  function fechaColombia(fechaStr) {
    if (!fechaStr) return null;
    // El backend ya envió la fecha con la zona horaria de Colombia ajustada
    // Solo necesitamos crear un objeto Date a partir del ISO string
    return new Date(fechaStr);
  }

  function hoyColombia() {
    // Obtener la fecha actual en Colombia como string YYYY-MM-DD
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  }

  function ayerColombia() {
    const hoy = new Date();
    // Restar 1 día y obtener en Colombia
    hoy.setDate(hoy.getDate() - 1);
    return hoy.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  }

  // ════════ HISTORIAL ADMIN ════════
  let haRegistros = [];
  let haFiltrados = [];
  let haPage = 1;
  const HA_LIMIT = 15;
  let haAutoInterval = null;
  let haFechaActual = '';

  function initHistorialAdmin() {
    const hoy = hoyColombia();
    document.getElementById('hist-admin-fecha').value = hoy;
    cargarDia('hoy');
    renderDiasRecientes();
    clearInterval(haAutoInterval);
    haAutoInterval = setInterval(() => {
      const f = document.getElementById('hist-admin-fecha').value;
      if (f === hoyColombia()) cargarDia('custom');
    }, 60000);
  }

  async function cargarDia(tipo) {
    const hoy  = hoyColombia();
    const ayer = ayerColombia();
    let fecha  = document.getElementById('hist-admin-fecha').value || hoy;

    if (tipo === 'hoy')  { fecha = hoy;  document.getElementById('hist-admin-fecha').value = hoy;  }
    if (tipo === 'ayer') { fecha = ayer; document.getElementById('hist-admin-fecha').value = ayer; }

    haFechaActual = fecha;

    const label  = document.getElementById('hist-admin-dia-label');
    const esHoy  = fecha === hoy;
    const esAyer = fecha === ayer;
    const fLabel = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    label.innerHTML = `<i class="bi bi-calendar-event" style="color:var(--brand-color);margin-right:5px;"></i>${fLabel}`
      + (esHoy  ? ' <span style="background:rgba(76,175,80,0.2);color:#a5d6a7;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:6px;">Hoy</span>' : '')
      + (esAyer ? ' <span style="background:rgba(255,193,7,0.15);color:#ffe082;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:6px;">Ayer</span>' : '');

    const tbody = document.getElementById('ha-tbody');
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:36px;opacity:.4;">
      <i class="bi bi-hourglass-split" style="font-size:24px;display:block;margin-bottom:8px;"></i>Cargando...</td></tr>`;

    try {
      const data = await apiGet(`/parqueadero/historial-admin?fecha=${fecha}`);
      if (!data.ok) { showToast(data.message || 'Error al cargar historial', 'error'); return; }

      // Si no hay registros para la fecha pedida y es "hoy" o "ayer",
      // buscar automáticamente el día más reciente con datos (hasta 60 días atrás)
      if ((!data.data || data.data.length === 0) && (tipo === 'hoy' || tipo === 'ayer')) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;opacity:.4;">
          <i class="bi bi-search" style="display:block;font-size:20px;margin-bottom:8px;"></i>
          Sin registros para hoy. Buscando el día más reciente con actividad...</td></tr>`;

        let encontrado = false;
        for (let i = 1; i <= 60 && !encontrado; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const prevFecha = d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
          const prevData = await apiGet(`/parqueadero/historial-admin?fecha=${prevFecha}`);
          if (prevData.ok && prevData.data && prevData.data.length > 0) {
            encontrado = true;
            fecha = prevFecha;
            haFechaActual = fecha;
            document.getElementById('hist-admin-fecha').value = fecha;
            const fLabelPrev = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
            label.innerHTML = `<i class="bi bi-calendar-event" style="color:var(--brand-color);margin-right:5px;"></i>${fLabelPrev}`
              + ` <span style="background:rgba(255,193,7,0.18);color:#ffe082;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:6px;">Último día con registros</span>`;
            haRegistros = prevData.data;
          }
        }

        if (!encontrado) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;opacity:.4;">
            <i class="bi bi-calendar-x" style="font-size:28px;display:block;margin-bottom:10px;"></i>
            No se encontraron registros en los últimos 60 días</td></tr>`;
          haRegistros = [];
          calcularResumenAdmin();
          renderTiposBar();
          filtrarTablaAdmin();
          return;
        }
      } else {
        haRegistros = data.data || [];
      }

      haPage = 1;
      document.getElementById('ha-buscar').value = '';
      document.getElementById('ha-filtro-tipo').value = '';
      calcularResumenAdmin();
      renderTiposBar();
      filtrarTablaAdmin();
    } catch (e) {
      console.error('cargarDia error:', e);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:36px;opacity:.4;">Error de conexión</td></tr>`;
    }
  }

  function calcularResumenAdmin() {
    const total   = haRegistros.length;
    const activos = haRegistros.filter(r => r.estado === 'activo').length;
    const compl   = haRegistros.filter(r => r.duracion_min != null);
    const promMin = compl.length ? Math.round(compl.reduce((s,r) => s + r.duracion_min, 0) / compl.length) : 0;
    const promH   = Math.floor(promMin / 60);
    const promM   = promMin % 60;

    const freq = {};
    haRegistros.forEach(r => { freq[r.tipo_vehiculo] = (freq[r.tipo_vehiculo] || 0) + 1; });
    const topTipo = Object.entries(freq).sort((a,b) => b[1]-a[1])[0];

    document.getElementById('ha-total').textContent    = total;
    document.getElementById('ha-activos').textContent  = activos;
    document.getElementById('ha-promedio').textContent = promH > 0 ? `${promH}h ${promM}m` : `${promM}m`;
    document.getElementById('ha-tipo-top').textContent = topTipo ? topTipo[0] : '—';
  }

  function renderTiposBar() {
    const panel = document.getElementById('ha-tipos-panel');
    const cont  = document.getElementById('ha-tipos-bars');
    if (!haRegistros.length) { panel.style.display = 'none'; return; }

    const colores = { 'Carro':'#4caf50', 'Moto':'#9c27b0', 'Bicicleta':'#2196f3' };
    const freq    = {};
    haRegistros.forEach(r => { freq[r.tipo_vehiculo] = (freq[r.tipo_vehiculo] || 0) + 1; });

    cont.innerHTML = Object.entries(freq).sort((a,b) => b[1]-a[1]).map(([tipo, count]) => {
      const pct   = Math.round(count * 100 / haRegistros.length);
      const color = colores[tipo] || '#888';
      return `<div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;">
          <span style="color:rgba(255,255,255,0.75);">${tipo}</span>
          <span style="color:rgba(255,255,255,0.45);">${count} visita${count!==1?'s':''} · ${pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:30px;height:22px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:30px;display:flex;align-items:center;padding-left:10px;font-size:11px;font-weight:700;transition:width .5s ease;">
            ${pct > 12 ? pct+'%' : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    panel.style.display = 'block';
  }

  function filtrarTablaAdmin() {
    const q     = (document.getElementById('ha-buscar')?.value || '').toLowerCase();
    const tipo  = document.getElementById('ha-filtro-tipo')?.value || '';
    haFiltrados = haRegistros.filter(r => {
      const matchQ    = !q || (r.nombre_completo||'').toLowerCase().includes(q) || (r.identificador||'').toLowerCase().includes(q);
      const matchTipo = !tipo || r.tipo_vehiculo === tipo;
      return matchQ && matchTipo;
    });
    haPage = 1;
    renderTablaAdmin();
  }

  function renderTablaAdmin() {
    const totalPags = Math.max(1, Math.ceil(haFiltrados.length / HA_LIMIT));
    if (haPage > totalPags) haPage = 1;
    const inicio = (haPage - 1) * HA_LIMIT;
    const pagina = haFiltrados.slice(inicio, inicio + HA_LIMIT);

    const tbody = document.getElementById('ha-tbody');
    const count = document.getElementById('ha-count');
    if (count) count.textContent = `${haFiltrados.length} registro${haFiltrados.length!==1?'s':''}`;

    if (!haFiltrados.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;opacity:.4;">
        <i class="bi bi-search" style="font-size:26px;display:block;margin-bottom:8px;"></i>
        ${haRegistros.length ? 'Sin resultados para ese filtro' : 'No hubo registros este día'}</td></tr>`;
      renderPaginAdmin(0, 1);
      return;
    }

    const iconoTipo = { 'Carro':'bi-car-front-fill', 'Moto':'bi-bicycle', 'Bicicleta':'bi-bicycle' };

    tbody.innerHTML = pagina.map((r, i) => {
      const num     = inicio + i + 1;
      const entrada = fechaColombia(r.fecha_entrada).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota' });
      const salida  = r.fecha_salida ? fechaColombia(r.fecha_salida).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota' }) : '—';
      const dur = r.duracion_min != null
        ? `${Math.floor(r.duracion_min/60)}h ${r.duracion_min%60}m`
        : r.estado === 'activo' ? '<span style="color:#a5d6a7;font-size:11px;">En curso</span>' : '—';
      const badge = r.estado !== 'activo'
        ? `<span class="badge-status done"><i class="bi bi-check-circle" style="margin-right:3px;"></i>Completado</span>`
        : `<span class="badge-status active"><i class="bi bi-circle-fill" style="font-size:7px;margin-right:4px;"></i>En curso</span>`;

      return `<tr>
        <td style="color:rgba(255,255,255,0.3);font-size:11px;">${num}</td>
        <td><i class="bi bi-person-fill" style="color:var(--brand-color);margin-right:5px;"></i>${r.nombre_completo}</td>
        <td><i class="bi ${iconoTipo[r.tipo_vehiculo]||'bi-car-front'}" style="color:rgba(255,255,255,0.45);margin-right:4px;"></i>${r.tipo_vehiculo} · <strong>${r.identificador}</strong></td>
        <td>${r.lado}</td>
        <td>${entrada}</td>
        <td>${salida}</td>
        <td>${dur}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');

    renderPaginAdmin(haFiltrados.length, totalPags);
    const info = document.getElementById('ha-page-info');
    if (info) info.textContent = `Página ${haPage} de ${totalPags}`;
  }

  function renderPaginAdmin(total, totalPags) {
    const cont = document.getElementById('ha-page-btns');
    if (!cont) return;
    cont.innerHTML = '';
    if (totalPags <= 1) return;

    const mk = (label, page, disabled, active) => {
      const b = document.createElement('button');
      b.innerHTML = label;
      b.style.cssText = `padding:5px 11px;border-radius:8px;
        border:1.5px solid rgba(255,255,255,${active?'0.35':'0.12'});
        background:${active?'var(--brand-color)':'rgba(255,255,255,0.05)'};
        color:${disabled?'rgba(255,255,255,0.2)':'#fff'};
        font-family:'Inter',sans-serif;font-size:12px;font-weight:${active?'600':'400'};
        cursor:${disabled?'default':'pointer'};`;
      if (!disabled) b.onclick = () => { haPage = page; renderTablaAdmin(); };
      return b;
    };

    cont.appendChild(mk('<i class="bi bi-chevron-left"></i>', haPage-1, haPage===1, false));
    for (let p=1; p<=totalPags; p++) {
      if (totalPags>7 && p>2 && p<totalPags-1 && Math.abs(p-haPage)>1) {
        if (p===3||p===totalPags-2) {
          const d = document.createElement('span');
          d.textContent = '…';
          d.style.cssText = 'padding:0 4px;color:rgba(255,255,255,0.25);';
          cont.appendChild(d);
        }
        continue;
      }
      cont.appendChild(mk(p, p, false, p===haPage));
    }
    cont.appendChild(mk('<i class="bi bi-chevron-right"></i>', haPage+1, haPage===totalPags, false));
  }

  function renderDiasRecientes() {
    const cont = document.getElementById('ha-dias-recientes');
    if (!cont) return;
    const hoy = new Date();
    cont.innerHTML = '';

    for (let i=0; i<14; i++) {
      const d   = new Date(hoy);
      d.setDate(hoy.getDate() - i);
      const iso = d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      const lbl = i===0 ? 'Hoy' : i===1 ? 'Ayer'
        : d.toLocaleDateString('es-CO', { weekday:'short', day:'numeric', month:'short' });

      const btn = document.createElement('button');
      btn.textContent = lbl;
      btn.dataset.fecha = iso;
      btn.style.cssText = `padding:7px 14px;border-radius:9px;
        border:1.5px solid rgba(255,255,255,0.15);
        background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);
        font-family:'Inter',sans-serif;font-size:12px;cursor:pointer;transition:all .15s;`;
      btn.onmouseenter = () => { btn.style.background='rgba(255,255,255,0.14)'; btn.style.color='#fff'; };
      btn.onmouseleave = () => { btn.style.background='rgba(255,255,255,0.06)'; btn.style.color='rgba(255,255,255,0.7)'; };
      btn.onclick = () => {
        document.getElementById('hist-admin-fecha').value = iso;
        cargarDia('custom');
      };
      cont.appendChild(btn);
    }
  }

  function exportarAdminCSV() {
    if (!haRegistros.length) { showToast('No hay registros para exportar', 'error'); return; }
    const cab  = ['Usuario','Tipo vehículo','Identificador','Lado','Fecha','Hora entrada','Hora salida','Duración (min)','Estado'];
    const rows = haRegistros.map(r => {
      const fe = fechaColombia(r.fecha_entrada);
      return [
        r.nombre_completo, r.tipo_vehiculo, r.identificador, r.lado,
        fe.toLocaleDateString('es-CO'),
        fe.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota' }),
        r.fecha_salida ? fechaColombia(r.fecha_salida).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}) : '',
        r.duracion_min ?? '',
        r.fecha_salida ? 'completado' : 'en curso'
      ];
    });
    const csv  = [cab,...rows].map(f => f.map(v=>`"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `historial_${haFechaActual || hoyColombia()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado ✓');
  }