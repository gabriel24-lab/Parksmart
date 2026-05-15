// superadmin-datos.js — Lógica del panel de Super Administrador
'use strict';

  // ══ GUARD: solo superadmin puede entrar aquí ══
  (function() {
    const u = Auth.getUser();
    if (!u || u.rol !== 'superadmin') {
      Auth.clear();
      window.location.href = 'login.html';
    }
  })();

  // ══ VARIABLES GLOBALES ══
  let usuarios   = [];
  let guardias   = [];
  let saProfile  = null;
  let saModalCb  = null;

  const ROL_LABELS = {
    aprendiz:   'Aprendiz',
    funcionario:'Funcionario',
    instructor: 'Instructor',
    admin:      'Guardia',
    guardia:    'Guardia',
    superadmin: 'Superadmin',
  };
  const ROL_COLORS = {
    aprendiz:   '#1565c0',
    funcionario:'#2e7d32',
    instructor: '#6a1b9a',
    admin:      '#e65100',
    guardia:    '#e65100',
    superadmin: '#7b1fa2',
  };

  // ══ INICIALIZACIÓN ══
  document.addEventListener('DOMContentLoaded', async () => {
    startClock();
    cargarPerfilSA();
    await Promise.all([
      cargarStatsAvanzados(),
      cargarCuposDesdeAPI(),
      cargarUsuariosSA(),
      cargarGuardias(),
      cargarRecientesDesdeAPI(),
      cargarCatalogos(),
    ]);
    setInterval(cargarStatsAvanzados, 60000);
    setInterval(cargarGuardias, 120000);
  });

  // ══ RELOJ ══
  function startClock() {
    function tick() {
      const now = new Date();
      const el  = document.getElementById('sa-clock');
      if (el) el.textContent = now.toLocaleString('es-CO', { dateStyle:'long', timeStyle:'short', timeZone:'America/Bogota' });
    }
    tick();
    setInterval(tick, 1000);
  }

  // ══ PERFIL SA ══
  async function cargarPerfilSA() {
    try {
      const res  = await apiFetch('/usuarios/perfil');
      if (!res) return;
      const data = await res.json();
      if (!data.ok) return;
      saProfile = data.data;
      document.getElementById('sa-nombre').value = data.data.nombre_completo || '';
      document.getElementById('sa-email').value  = data.data.email || '';
      liveUpdateSAHeader();

      // Foto
      if (data.data.foto_perfil) {
        const img = document.getElementById('profile-avatar-img');
        if (img) { img.src = data.data.foto_perfil; img.style.display = 'block'; }
        const ini = document.getElementById('profile-avatar-initials');
        if (ini) ini.style.display = 'none';
        const av = document.getElementById('topbar-av');
        if (av) { av.style.backgroundImage = `url(${data.data.foto_perfil})`; av.style.backgroundSize = 'cover'; av.textContent = ''; }
      }
    } catch(e) { console.warn('cargarPerfilSA:', e); }
  }

  function liveUpdateSAHeader() {
    const nombre = (document.getElementById('sa-nombre')?.value || '').trim();
    const parts  = nombre.split(' ').filter(Boolean);
    const initials = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : (parts[0]?.[0]?.toUpperCase() || 'SA');
    const ini = document.getElementById('profile-avatar-initials');
    if (ini) ini.textContent = initials;
    const av = document.getElementById('topbar-av');
    if (av && !saProfile?.foto_perfil) av.textContent = initials;
  }

  async function savePerfilSA() {
    const nombre = document.getElementById('sa-nombre')?.value.trim();
    const email  = document.getElementById('sa-email')?.value.trim();
    if (!nombre) { showToast('Ingresa tu nombre completo.', 'error'); return; }
    try {
      const res  = await apiFetch('/usuarios/perfil', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nombre_completo: nombre, email }) });
      if (!res) return;
      const data = await res.json();
      if (!data.ok) { showToast(data.message || 'Error al guardar.', 'error'); return; }
      liveUpdateSAHeader();
      showToast('Perfil actualizado ✓', 'success');
    } catch { showToast('Error de conexión.', 'error'); }
  }

  async function subirFotoPerfilSA(input) {
    if (!input.files[0]) return;
    const fd = new FormData();
    fd.append('foto', input.files[0]);
    try {
      const res  = await apiFetch('/usuarios/foto-perfil', { method:'POST', body: fd });
      if (!res) return;
      const data = await res.json();
      if (!data.ok) { showToast(data.message || 'Error al subir foto', 'error'); return; }
      const img = document.getElementById('profile-avatar-img');
      if (img) { img.src = data.foto_url + '?t=' + Date.now(); img.style.display = 'block'; }
      const ini = document.getElementById('profile-avatar-initials');
      if (ini) ini.style.display = 'none';
      const av = document.getElementById('topbar-av');
      if (av) { av.style.backgroundImage = `url(${data.foto_url})`; av.style.backgroundSize = 'cover'; av.textContent = ''; }
      showToast('Foto actualizada ✓');
    } catch { showToast('No se pudo subir la foto', 'error'); }
    input.value = '';
  }

  async function changePasswordSA() {
    const actual  = document.getElementById('sec-pass-act')?.value;
    const nuevo   = document.getElementById('sec-pass-new')?.value;
    const confirm = document.getElementById('sec-pass-confirm')?.value;
    if (!actual || !nuevo || !confirm) { showToast('Completa los tres campos.', 'error'); return; }
    if (nuevo.length < 8) { showToast('Mínimo 8 caracteres.', 'error'); return; }
    if (nuevo !== confirm) { showToast('Las contraseñas no coinciden.', 'error'); return; }
    try {
      const res  = await apiFetch('/usuarios/cambiar-password', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password_actual: actual, password_nuevo: nuevo }) });
      if (!res) return;
      const data = await res.json();
      if (!data.ok) { showToast(data.message || 'Error.', 'error'); return; }
      document.getElementById('sec-pass-act').value = '';
      document.getElementById('sec-pass-new').value = '';
      document.getElementById('sec-pass-confirm').value = '';
      showToast('Contraseña actualizada ✓', 'success');
    } catch { showToast('Error de conexión.', 'error'); }
  }

  function toggleSecPass(inputId, iconId) {
    const inp = document.getElementById(inputId);
    const ico = document.getElementById(iconId);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if (ico) ico.className = inp.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
  }

  // ══ STATS ══
  async function cargarStatsAvanzados() {
    try {
      const res  = await apiFetch('/parqueadero/stats-hoy');
      if (!res) return;
      const data = await res.json();
      if (data.ok && data.data) {
        const d = data.data;
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
        setEl('stat-entradas', d.entradas_hoy);
        setEl('stat-salidas',  d.salidas_hoy);
        renderChartHora(d.por_hora    || []);
        renderChartSemana(d.por_semana || []);
      }
    } catch(e) { console.warn('stats-hoy:', e); }
  }

  // ══ CUPOS ══
  async function cargarCuposDesdeAPI() {
    try {
      const [res1, res2] = await Promise.all([ apiFetch('/parqueadero/cupos'), apiFetch('/parqueadero/ocupacion-rol') ]);
      if (!res1 || !res2) return;
      const [d1, d2] = await Promise.all([res1.json(), res2.json()]);
      if (d1.ok && d1.data) {
        ladoA.total   = d1.data.total_lado_a   ?? ladoA.total;
        ladoA.ocupados= d1.data.ocupados_lado_a ?? ladoA.ocupados;
        document.getElementById('a-total-input').value = ladoA.total;
        refreshLadoA();
      }
      if (d2.ok && d2.data) {
        const b = d2.data;
        ladoB.carros.dentro = b.carros_dentro ?? 0;
        ladoB.motos.dentro  = b.motos_dentro  ?? 0;
        ladoB.bicis.dentro  = b.bicis_dentro  ?? 0;
        const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
        setEl('b-carros-dentro', ladoB.carros.dentro);
        setEl('b-motos-dentro',  ladoB.motos.dentro);
        setEl('b-bicis-dentro',  ladoB.bicis.dentro);
      }
    } catch(e) { console.warn('cupos:', e); }
  }

  // ══ ACTIVIDAD RECIENTE ══
  async function cargarRecientesDesdeAPI() {
    const tbody = document.getElementById('recent-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;opacity:0.5"><i class="bi bi-hourglass-split"></i> Cargando...</td></tr>';
    try {
      const res  = await apiFetch('/parqueadero/reciente');
      if (!res) return;
      const data = await res.json();
      if (!data.ok || !data.data?.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;opacity:0.4">Sin actividad hoy</td></tr>';
        return;
      }
      tbody.innerHTML = data.data.slice(0, 10).map(r => {
        const badge = r.estado === 'activo'
          ? '<span class="event-badge in">Dentro</span>'
          : '<span class="event-badge out">Salió</span>';
        const hora = new Date(r.fecha_entrada).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'});
        return `<tr>
          <td>${r.nombre_completo}</td>
          <td>${r.tipo_vehiculo} · ${hora}</td>
          <td>${badge}</td>
        </tr>`;
      }).join('');
    } catch(e) { console.warn('reciente:', e); }
  }

  // ══ CATÁLOGOS ══
  async function cargarCatalogos() {
    try {
      const [resR, resC] = await Promise.all([ apiFetch('/catalogos/regiones'), apiFetch('/catalogos/centros') ]);
      const [dR, dC]     = await Promise.all([ resR.json(), resC.json() ]);
      if (dR.ok) {
        const sel = document.getElementById('reg-region');
        if (sel) {
          sel.innerHTML = '<option value="">Selecciona una región</option>';
          dR.data.forEach(r => {
            const o = document.createElement('option');
            o.value = r.id_region; o.textContent = r.nombre;
            sel.appendChild(o);
          });
        }
      }
    } catch(e) { console.warn('catalogos:', e); }
  }

  async function filterCentrosReg() {
    const region = document.getElementById('reg-region')?.value;
    if (!region) return;
    try {
      const res  = await apiFetch(`/catalogos/centros?region=${region}`);
      if (!res) return;
      const data = await res.json();
      const sel  = document.getElementById('reg-centro');
      if (!sel || !data.ok) return;
      sel.innerHTML = '<option value="">Selecciona un centro</option>';
      data.data.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id_centro; o.textContent = c.nombre;
        sel.appendChild(o);
      });
    } catch(e) {}
  }

  // ══ REGISTRAR USUARIO ══
  async function registrarUsuario() {
    const nombre  = document.getElementById('reg-nombre')?.value.trim();
    const tipoId  = document.getElementById('reg-tipo-id')?.value;
    const numId   = document.getElementById('reg-num-id')?.value.trim();
    const email   = document.getElementById('reg-email')?.value.trim();
    const rol     = document.getElementById('reg-rol')?.value;
    const centro  = document.getElementById('reg-centro')?.value;

    if (!nombre || !tipoId || !numId || !rol) { showToast('Completa los campos obligatorios.', 'error'); return; }

    try {
      const res  = await apiFetch('/auth/admin-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_completo: nombre, tipo_id: tipoId, numero_id: numId, email: email || undefined, rol, id_centro: centro || undefined }),
      });
      if (!res) return;
      const data = await res.json();
      if (!data.ok) { showToast(data.message || (data.errors && data.errors[0]?.msg) || 'Error al registrar.', 'error'); return; }
      showToast(`Usuario ${nombre} registrado con rol ${ROL_LABELS[rol] || rol} ✓`, 'success');
      ['reg-nombre','reg-num-id','reg-email'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
      document.getElementById('reg-tipo-id').value  = '';
      document.getElementById('reg-rol').value      = 'aprendiz';
      document.getElementById('reg-centro').innerHTML = '<option value="">Selecciona primero una región</option>';
      // Refrescar listas
      cargarUsuariosSA();
      cargarGuardias();
    } catch { showToast('Error de conexión.', 'error'); }
  }

  // ══ USUARIOS SUPERADMIN ══
  async function cargarUsuariosSA() {
    try {
      const res  = await apiFetch('/parqueadero/usuarios-superadmin');
      if (!res) return;
      const data = await res.json();
      if (data.ok && data.data) {
        usuarios = data.data.map(u => ({
          id:          u.qr_code || 'SIN-QR',
          id_usuario:  u.id_usuario,
          nombre:      u.nombre_completo || 'Sin nombre',
          tipoId:      u.tipo_id,
          numId:       u.numero_id,
          email:       u.email || null,
          rol:         u.rol || 'aprendiz',
          centro:      u.centro_nombre || 'No asignado',
          activo:      u.activo,
          vehiculos:   u.vehiculos || [],
        }));
        // Actualizar stat total
        const el = document.getElementById('stat-usuarios-total');
        if (el) el.textContent = usuarios.filter(u => u.activo).length;
        renderUsersTable(usuarios);
      }
    } catch(e) { console.warn('usuarios-sa:', e); }
  }

  function renderUsersTable(list) {
    const tbody = document.getElementById('users-tbody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,0.4);padding:24px">Sin resultados</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(u => {
      const rolColor = ROL_COLORS[u.rol] || '#555';
      const rolLabel = ROL_LABELS[u.rol] || u.rol;
      const estadoBadge = u.activo
        ? '<span class="event-badge in">Activo</span>'
        : '<span class="event-badge out">Inactivo</span>';
      const numMasked = '*'.repeat(Math.max(0, (u.numId||'').length - 4)) + (u.numId||'').slice(-4);

      // Opciones de rol (excluye superadmin)
      const rolesOpts = ['aprendiz','funcionario','instructor','admin'].map(r =>
        `<option value="${r}" ${u.rol === r ? 'selected' : ''}>${ROL_LABELS[r]}</option>`
      ).join('');

      const toggleLabel = u.activo ? 'Desactivar' : 'Activar';
      const toggleClass = u.activo ? 'sa-toggle-btn on' : 'sa-toggle-btn off';

      // No mostrar controles para otros superadmins
      const isSA = u.rol === 'superadmin';
      const controles = isSA
        ? `<span style="font-size:11px;color:rgba(255,255,255,0.3);">— superadmin —</span>`
        : `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <select class="sa-rol-select" onchange="cambiarRol(${u.id_usuario}, this.value)">${rolesOpts}</select>
            <button class="${toggleClass}" onclick="toggleUsuario(${u.id_usuario}, this)">${toggleLabel}</button>
           </div>`;

      return `<tr style="${u.activo ? '' : 'opacity:0.5;'}">
        <td>
          <div class="user-cell">
            <div class="mini-av">${u.nombre.split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
            <span>${u.nombre}</span>
          </div>
        </td>
        <td>${u.tipoId} · ${numMasked}</td>
        <td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;background:${rolColor}22;border:0.5px solid ${rolColor}55;color:${rolColor};">${rolLabel}</span></td>
        <td class="centro-td">${u.centro}</td>
        <td>${estadoBadge}</td>
        <td>${controles}</td>
      </tr>`;
    }).join('');
  }

  function filterUsers() {
    const q       = document.getElementById('user-search')?.value.toLowerCase() || '';
    const rolF    = document.getElementById('filter-rol')?.value || '';
    const estadoF = document.getElementById('filter-estado')?.value || '';

    const filtered = usuarios.filter(u => {
      const matchQ = u.nombre.toLowerCase().includes(q) || u.numId.includes(q) || u.id.toLowerCase().includes(q);
      const matchR = !rolF || u.rol === rolF;
      const matchE = !estadoF || (estadoF === 'activo' ? u.activo : !u.activo);
      return matchQ && matchR && matchE;
    });
    renderUsersTable(filtered);
  }

  async function toggleUsuario(id, btn) {
    if (btn) btn.disabled = true;
    try {
      const res  = await apiFetch(`/parqueadero/usuarios/${id}/toggle`, { method: 'PUT' });
      if (!res) { if(btn) btn.disabled = false; return; }
      const data = await res.json();
      if (!data.ok) { showToast(data.message || 'Error.', 'error'); if(btn) btn.disabled = false; return; }
      showToast(data.message, data.activo ? 'success' : 'info');
      await cargarUsuariosSA();
    } catch { showToast('Error de conexión.', 'error'); }
    if (btn) btn.disabled = false;
  }

  async function cambiarRol(id, nuevoRol) {
    openSAModal({
      icon: '🔄',
      title: 'Cambiar rol',
      desc: `¿Deseas cambiar el rol de este usuario a <strong>${ROL_LABELS[nuevoRol] || nuevoRol}</strong>?`,
      btnClass: 'ok',
      btnLabel: 'Cambiar rol',
      onConfirm: async () => {
        try {
          const res  = await apiFetch(`/parqueadero/usuarios/${id}/rol`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rol: nuevoRol }) });
          if (!res) return;
          const data = await res.json();
          if (!data.ok) { showToast(data.message || 'Error.', 'error'); return; }
          showToast(data.message, 'success');
          await cargarUsuariosSA();
          await cargarGuardias();
        } catch { showToast('Error de conexión.', 'error'); }
      },
    });
  }

  // ══ GUARDIAS ══
  async function cargarGuardias() {
    const list     = document.getElementById('guardias-list');
    const dashList = document.getElementById('dash-guardias-list');
    try {
      const res  = await apiFetch('/parqueadero/guardias');
      if (!res) return;
      const data = await res.json();
      if (!data.ok) return;
      guardias = data.data;

      // Estadísticas de guardias
      const activos   = guardias.filter(g => g.activo);
      const inactivos = guardias.filter(g => !g.activo);
      const totalRegistrosHoy = guardias.reduce((s, g) => s + parseInt(g.registros_hoy || 0), 0);

      const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
      setEl('stat-guardias',       activos.length);
      setEl('g-activos',           activos.length);
      setEl('g-inactivos',         inactivos.length);
      setEl('g-registros-hoy',     totalRegistrosHoy);

      // Render lista completa (sección Guardias)
      if (list) {
        if (!guardias.length) {
          list.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">
            <i class="bi bi-shield-x" style="font-size:36px;display:block;margin-bottom:12px;"></i>
            No hay guardias registrados. <button class="link-btn" onclick="showSection('registrar',null)">Registra uno aquí</button>
          </div>`;
        } else {
          list.innerHTML = guardias.map(g => renderGuardiaCard(g)).join('');
        }
      }

      // Mini-lista en dashboard (solo activos, máx 5)
      if (dashList) {
        if (!activos.length) {
          dashList.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:13px;">Sin guardias activos</div>';
        } else {
          dashList.innerHTML = activos.slice(0, 5).map(g => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);">
              <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1a3d1f,#2FA440);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;">
                ${g.nombre_completo.split(' ').map(w=>w[0]).slice(0,2).join('')}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.nombre_completo}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.4);">${parseInt(g.registros_hoy||0)} registros hoy</div>
              </div>
              <span class="event-badge in" style="font-size:10px;">Activo</span>
            </div>`).join('');
        }
      }
    } catch(e) { console.warn('guardias:', e); }
  }

  function renderGuardiaCard(g) {
    const iniciales = g.nombre_completo.split(' ').map(w=>w[0]).slice(0,2).join('');
    const ultimoReg = g.ultimo_registro
      ? new Date(g.ultimo_registro).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'})
      : 'Sin actividad';

    const toggleClass = g.activo ? 'g-btn g-btn-toggle-on' : 'g-btn g-btn-toggle-off';
    const toggleLabel = g.activo
      ? '<i class="bi bi-toggle2-on"></i> Activo'
      : '<i class="bi bi-toggle2-off"></i> Inactivo';

    return `
    <div class="guardia-card ${g.activo ? '' : 'inactivo'}" id="guardia-card-${g.id_usuario}">
      <div class="guardia-av">${iniciales}</div>
      <div class="guardia-info">
        <p class="guardia-nombre">${g.nombre_completo}</p>
        <div class="guardia-meta">
          <span><i class="bi bi-building"></i>${g.centro_nombre || 'Sin centro'}</span>
          <span><i class="bi bi-clipboard-check"></i>${parseInt(g.registros_hoy||0)} registros hoy</span>
          <span><i class="bi bi-clock-history"></i>Último: ${ultimoReg}</span>
        </div>
      </div>
      <div class="guardia-actions">
        <button class="${toggleClass}" onclick="toggleGuardia(${g.id_usuario}, this)">
          ${toggleLabel}
        </button>
        <button class="g-btn g-btn-del" onclick="eliminarGuardia(${g.id_usuario}, '${g.nombre_completo.replace(/'/g,"\\'")}')">
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    </div>`;
  }

  async function toggleGuardia(id, btn) {
    if (btn) btn.disabled = true;
    try {
      const res  = await apiFetch(`/parqueadero/guardias/${id}/toggle`, { method: 'PUT' });
      if (!res) { if(btn) btn.disabled = false; return; }
      const data = await res.json();
      if (!data.ok) { showToast(data.message || 'Error.', 'error'); if(btn) btn.disabled = false; return; }
      showToast(data.message, data.activo ? 'success' : 'info');
      await cargarGuardias();
    } catch { showToast('Error de conexión.', 'error'); }
    if (btn) btn.disabled = false;
  }

  function eliminarGuardia(id, nombre) {
    openSAModal({
      icon: '⚠️',
      title: 'Desactivar guardia',
      desc: `¿Seguro que deseas desactivar la cuenta de <strong>${nombre}</strong>? El guardia no podrá iniciar sesión.`,
      btnClass: 'danger',
      btnLabel: 'Desactivar',
      onConfirm: async () => {
        try {
          const res  = await apiFetch(`/parqueadero/guardias/${id}`, { method: 'DELETE' });
          if (!res) return;
          const data = await res.json();
          if (!data.ok) { showToast(data.message || 'Error.', 'error'); return; }
          showToast('Guardia desactivado.', 'info');
          await cargarGuardias();
        } catch { showToast('Error de conexión.', 'error'); }
      },
    });
  }

  // ══ MODAL CONFIRM ══
  function openSAModal({ icon, title, desc, btnClass, btnLabel, onConfirm }) {
    document.getElementById('sa-modal-icon').textContent   = icon;
    document.getElementById('sa-modal-title').textContent  = title;
    document.getElementById('sa-modal-desc').innerHTML     = desc;
    const btn = document.getElementById('sa-modal-confirm-btn');
    btn.className = `sa-modal-confirm ${btnClass}`;
    btn.textContent = btnLabel;
    saModalCb = onConfirm;
    btn.onclick = async () => { closeSAModal(); if (saModalCb) await saModalCb(); };
    document.getElementById('sa-confirm-modal').classList.add('visible');
  }

  function closeSAModal() {
    document.getElementById('sa-confirm-modal').classList.remove('visible');
    saModalCb = null;
  }

  // ══ HISTORIAL ══
  let haRegistros     = [];
  let haRegistrosFilt = [];
  let haPage          = 1;
  const HA_PAGE_SIZE  = 15;

  async function cargarDia(modo) {
    const input = document.getElementById('hist-admin-fecha');
    const label = document.getElementById('hist-admin-dia-label');
    const hoyBtn  = document.getElementById('hist-btn-hoy');
    const ayerBtn = document.getElementById('hist-btn-ayer');

    let fecha;
    const hoyDate = new Date(new Date().toLocaleString('en-US',{timeZone:'America/Bogota'}));
    if (modo === 'hoy') {
      fecha = hoyDate.toISOString().slice(0, 10);
      if (input) input.value = fecha;
    } else if (modo === 'ayer') {
      const ayer = new Date(hoyDate); ayer.setDate(ayer.getDate() - 1);
      fecha = ayer.toISOString().slice(0, 10);
      if (input) input.value = fecha;
    } else {
      fecha = input?.value;
    }
    if (!fecha) { showToast('Selecciona una fecha.', 'error'); return; }

    if (hoyBtn)  hoyBtn.style.background  = modo==='hoy'  ? '' : 'rgba(255,255,255,0.08)';
    if (ayerBtn) ayerBtn.style.background = modo==='ayer' ? '' : 'rgba(255,255,255,0.08)';
    if (label)   label.textContent = `Mostrando: ${new Date(fecha+'T12:00:00').toLocaleDateString('es-CO',{dateStyle:'full',timeZone:'America/Bogota'})}`;

    const tbody = document.getElementById('ha-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;opacity:.5"><i class="bi bi-hourglass-split"></i> Cargando...</td></tr>';

    try {
      const res  = await apiFetch(`/parqueadero/historial-admin?fecha=${fecha}`);
      if (!res) return;
      const data = await res.json();
      if (!data.ok) { showToast('Error al cargar historial.', 'error'); return; }
      haRegistros = (data.data || []).map(r => ({ ...r, duracion_min: r.duracion_min != null ? Number(r.duracion_min) : null }));
      haPage = 1;
      renderResumenDia(haRegistros);
      filtrarTablaAdmin();
      renderDiasRecientes();
    } catch(e) { console.warn('cargarDia:', e); }
  }

  function renderResumenDia(registros) {
    const total     = registros.length;
    const activos   = registros.filter(r => r.estado !== 'completado').length;
    const completos = registros.filter(r => r.duracion_min != null);
    const promMin   = completos.length ? Math.round(completos.reduce((s,r) => s + r.duracion_min, 0) / completos.length) : 0;
    const tipos     = {};
    registros.forEach(r => { const t = r.tipo_vehiculo || 'Desconocido'; tipos[t] = (tipos[t] || 0) + 1; });
    const topTipo   = Object.entries(tipos).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';

    const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    setEl('ha-total',    total);
    setEl('ha-activos',  activos);
    setEl('ha-promedio', promMin >= 60 ? `${Math.floor(promMin/60)}h ${promMin%60}m` : `${promMin}m`);
    setEl('ha-tipo-top', topTipo);

    const panel = document.getElementById('ha-tipos-panel');
    const bars  = document.getElementById('ha-tipos-bars');
    if (panel && bars && Object.keys(tipos).length) {
      panel.style.display = 'block';
      const max = Math.max(...Object.values(tipos));
      bars.innerHTML = Object.entries(tipos).sort((a,b)=>b[1]-a[1]).map(([tipo, cnt]) => `
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="width:90px;font-size:12px;color:rgba(255,255,255,0.6);text-align:right;">${tipo}</span>
          <div style="flex:1;background:rgba(255,255,255,0.07);border-radius:6px;overflow:hidden;height:18px;">
            <div style="width:${Math.round(cnt/max*100)}%;background:var(--brand-color);height:100%;border-radius:6px;transition:width 0.4s;"></div>
          </div>
          <span style="font-size:12px;color:rgba(255,255,255,0.5);width:30px;">${cnt}</span>
        </div>`).join('');
    } else if (panel) { panel.style.display = 'none'; }
  }

  function filtrarTablaAdmin() {
    const q    = document.getElementById('ha-buscar')?.value.toLowerCase() || '';
    const tipo = document.getElementById('ha-filtro-tipo')?.value || '';
    haRegistrosFilt = haRegistros.filter(r => {
      const matchQ = !q || (r.nombre_completo||'').toLowerCase().includes(q) || (r.identificador||'').toLowerCase().includes(q);
      const matchT = !tipo || (r.tipo_vehiculo||'').toLowerCase() === tipo.toLowerCase();
      return matchQ && matchT;
    });
    haPage = 1;
    renderTablaAdmin();
  }

  function renderTablaAdmin() {
    const tbody    = document.getElementById('ha-tbody');
    const count    = document.getElementById('ha-count');
    const pageInfo = document.getElementById('ha-page-info');
    const pageBtns = document.getElementById('ha-page-btns');
    if (!tbody) return;

    const totalPags = Math.max(1, Math.ceil(haRegistrosFilt.length / HA_PAGE_SIZE));
    if (haPage > totalPags) haPage = 1;
    const slice = haRegistrosFilt.slice((haPage-1)*HA_PAGE_SIZE, haPage*HA_PAGE_SIZE);

    if (count) count.textContent = `${haRegistrosFilt.length} registros`;
    if (pageInfo) pageInfo.textContent = `Página ${haPage} de ${totalPags}`;

    if (!haRegistrosFilt.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;opacity:.4;">Sin registros</td></tr>';
      if (pageBtns) pageBtns.innerHTML = '';
      return;
    }

    tbody.innerHTML = slice.map((r, i) => {
      const num     = (haPage-1)*HA_PAGE_SIZE + i + 1;
      const entrada = new Date(r.fecha_entrada).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'});
      const salida  = r.fecha_salida ? new Date(r.fecha_salida).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'}) : '—';
      const dur     = r.duracion_min != null ? (r.duracion_min >= 60 ? `${Math.floor(r.duracion_min/60)}h ${Math.round(r.duracion_min%60)}m` : `${Math.round(r.duracion_min)}m`) : '—';
      const badge   = r.estado === 'completado'
        ? '<span class="event-badge out">Completado</span>'
        : '<span class="event-badge in">En curso</span>';
      return `<tr>
        <td style="color:rgba(255,255,255,0.35);font-size:12px;">${num}</td>
        <td>${r.nombre_completo || '—'}</td>
        <td>${r.tipo_vehiculo} · <strong>${r.identificador || '—'}</strong></td>
        <td>${r.lado || '—'}</td>
        <td>${entrada}</td>
        <td>${salida}</td>
        <td>${dur}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');

    // Paginación
    if (pageBtns) {
      pageBtns.innerHTML = '';
      if (totalPags <= 1) return;
      const mk = (label, page, disabled, active) => {
        const b = document.createElement('button');
        b.innerHTML = label;
        b.style.cssText = `padding:6px 12px;border-radius:8px;border:1.5px solid rgba(255,255,255,${active?'0.4':'0.15'});background:${active?'var(--brand-color)':'rgba(255,255,255,0.06)'};color:${disabled?'rgba(255,255,255,0.25)':'#fff'};font-family:'Inter',sans-serif;font-size:13px;cursor:${disabled?'default':'pointer'};`;
        if (!disabled) b.onclick = () => { haPage = page; renderTablaAdmin(); };
        return b;
      };
      pageBtns.appendChild(mk('<i class="bi bi-chevron-left"></i>', haPage-1, haPage===1, false));
      for (let p=1; p<=totalPags; p++) pageBtns.appendChild(mk(p, p, false, p===haPage));
      pageBtns.appendChild(mk('<i class="bi bi-chevron-right"></i>', haPage+1, haPage===totalPags, false));
    }
  }

  function renderDiasRecientes() {
    const cont = document.getElementById('ha-dias-recientes');
    if (!cont) return;
    const hoy = new Date(new Date().toLocaleString('en-US',{timeZone:'America/Bogota'}));
    cont.innerHTML = Array.from({length:7},(_,i) => {
      const d = new Date(hoy); d.setDate(d.getDate()-i);
      const iso   = d.toISOString().slice(0,10);
      const label = i===0?'Hoy':i===1?'Ayer':d.toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'short',timeZone:'America/Bogota'});
      return `<button class="btn-save" onclick="document.getElementById('hist-admin-fecha').value='${iso}';cargarDia('custom')" style="padding:8px 14px;font-size:12px;background:rgba(255,255,255,0.07);border:1.5px solid rgba(255,255,255,0.15);">${label}</button>`;
    }).join('');
  }

  function exportarAdminExcel() {
    if (!haRegistros.length) { showToast('No hay registros para exportar', 'error'); return; }
    const cols   = ['#','Usuario','Vehículo','Identificador','Lado','Entrada','Salida','Duración','Estado'];
    const rows   = haRegistros.map((r,i) => [
      i+1, r.nombre_completo||'—', r.tipo_vehiculo||'—', r.identificador||'—', r.lado||'—',
      new Date(r.fecha_entrada).toLocaleString('es-CO',{timeZone:'America/Bogota'}),
      r.fecha_salida ? new Date(r.fecha_salida).toLocaleString('es-CO',{timeZone:'America/Bogota'}) : '—',
      r.duracion_min!=null?(r.duracion_min>=60?`${Math.floor(r.duracion_min/60)}h ${Math.round(r.duracion_min%60)}m`:`${Math.round(r.duracion_min)}m`):'—',
      r.estado==='completado'?'Completado':'En curso',
    ]);
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table>
      <tr><td colspan="${cols.length}" style="background:#7b1fa2;color:#fff;font-size:15pt;font-weight:700;padding:10pt;">🅿 Parksmart — Historial (Superadmin)</td></tr>
      <tr>${cols.map(c=>`<td style="background:#4a148c;color:#fff;font-weight:700;padding:7pt 10pt;">${c}</td>`).join('')}</tr>
      ${rows.map(r=>`<tr>${r.map(v=>`<td style="padding:6pt 10pt;border:0.5pt solid #e1bee7;">${v}</td>`).join('')}</tr>`).join('')}
    </table></body></html>`;
    const blob = new Blob(['\uFEFF'+html],{type:'application/vnd.ms-excel;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Parksmart_SA_${new Date().toISOString().slice(0,10)}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Excel exportado ✓', 'success');
  }

  // ══ GRÁFICAS ══
  let _chartHora, _chartSemana;

  function chartDefaults() {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks:{ color:'rgba(255,255,255,0.5)',font:{size:11} }, grid:{ color:'rgba(255,255,255,0.06)' } },
        y: { ticks:{ color:'rgba(255,255,255,0.5)',font:{size:11} }, grid:{ color:'rgba(255,255,255,0.06)' }, beginAtZero:true },
      },
    };
  }

  function renderChartHora(porHora) {
    const wrap = document.querySelector('#section-dashboard .chart-canvas-wrap');
    const canvas = document.getElementById('chartHora');
    if (!canvas) return;
    if (_chartHora) _chartHora.destroy();
    if (!porHora.length) { canvas.style.display='none'; return; }
    canvas.style.display='';
    _chartHora = new Chart(canvas, {
      type:'bar',
      data:{
        labels: porHora.map(h=>`${h.hora}:00`),
        datasets:[{
          label:'Entradas', data: porHora.map(h=>h.entradas),
          backgroundColor:'rgba(47,164,64,0.65)', borderColor:'#2FA440', borderWidth:1.5, borderRadius:5,
        }],
      },
      options: chartDefaults(),
    });
  }

  function renderChartSemana(porSemana) {
    const canvas = document.getElementById('chartSemana');
    if (!canvas) return;
    if (_chartSemana) _chartSemana.destroy();
    const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    if (!porSemana.length) { canvas.style.display='none'; return; }
    canvas.style.display='';
    _chartSemana = new Chart(canvas, {
      type:'line',
      data:{
        labels: porSemana.map(d=>dias[d.dia_semana]),
        datasets:[{
          label:'Ingresos', data: porSemana.map(d=>d.ingresos),
          backgroundColor:'rgba(47,164,64,0.15)', borderColor:'#2FA440', borderWidth:2,
          fill:true, tension:0.4, pointBackgroundColor:'#2FA440', pointRadius:4,
        }],
      },
      options: chartDefaults(),
    });
  }

  // ══ NAVEGACIÓN ══
  function showSection(name, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('section-' + name)?.classList.add('active');
    document.querySelectorAll(`.nav-item[onclick*="'${name}'"]`).forEach(el => el.classList.add('active'));
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('show');
    if (name === 'guardias') cargarGuardias();
    if (name === 'historia') { haPage = 1; cargarDia('hoy'); }
    if (name === 'usuarios') cargarUsuariosSA();
  }

  function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('overlay')?.classList.toggle('show');
  }

  // ══ LOGOUT ══
  async function handleLogout() {
    try { await apiFetch('/auth/logout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ refresh_token: Auth.getRefreshToken() }) }); } catch {}
    Auth.clear();
    window.location.href = 'login.html';
  }

  // ══ TOAST ══
  function showToast(msg, type = 'success') {
    let toast = document.getElementById('toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast); }
    const icons = { success:'bi-check-circle-fill', error:'bi-x-circle-fill', info:'bi-info-circle-fill' };
    toast.className = `toast-msg toast toast-${type}`;
    toast.innerHTML = `<i class="bi ${icons[type]||icons.success}"></i> ${msg}`;
    toast.style.opacity = '1'; toast.style.transform = 'translateY(0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateY(20px)'; }, 3200);
  }
