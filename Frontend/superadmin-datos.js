// superadmin-datos.js — Lógica EXCLUSIVA del Super Administrador
// Los scripts admin-cupos.js, admin-datos.js y admin-scanner.js ya proveen
// las funciones compartidas (cupos, scanner, historial, stats, toast, showSection, etc.)
'use strict';

// ══ GUARD: solo superadmin puede entrar aquí ══
(function () {
  const u = Auth.getUser();
  if (!u || u.rol !== 'superadmin') {
    Auth.clear();
    window.location.href = 'login.html';
  }
})();

// ══ VARIABLES EXCLUSIVAS DEL SUPERADMIN ══
let guardias   = [];
let saProfile  = null;
let saModalCb  = null;
let saUsuarios = [];

const SA_ROL_LABELS = {
  aprendiz:    'Aprendiz',
  funcionario: 'Funcionario',
  instructor:  'Instructor',
  admin:       'Guardia',
  guardia:     'Guardia',
  superadmin:  'Superadmin',
};
const SA_ROL_COLORS = {
  aprendiz:    '#1565c0',
  funcionario: '#2e7d32',
  instructor:  '#6a1b9a',
  admin:       '#e65100',
  guardia:     '#e65100',
  superadmin:  '#7b1fa2',
};

// ══ INICIALIZACIÓN SUPERADMIN ══
document.addEventListener('DOMContentLoaded', async () => {
  cargarPerfilSA();
  // Cargar estadísticas del dashboard (gráficas de hora y semana)
  // cargarStatsAvanzados viene de admin-datos.js y llena los charts del dashboard
  if (typeof cargarStatsAvanzados === 'function') cargarStatsAvanzados();
  await Promise.all([
    cargarStatsGuardias(),
    cargarUsuariosSA(),
    cargarGuardias(),
  ]);
  // Auto-refresh de gráficas y guardias
  setInterval(() => {
    if (typeof cargarStatsAvanzados === 'function') cargarStatsAvanzados();
  }, 60000);
  setInterval(cargarGuardias, 120000);
});

// ══ PERFIL SA ══
async function cargarPerfilSA() {
  try {
    const res  = await apiFetch('/usuarios/perfil');
    if (!res) return;
    const data = await res.json();
    if (!data.ok) return;
    saProfile = data.data;
    const nombre = document.getElementById('sa-nombre');
    const email  = document.getElementById('sa-email');
    if (nombre) nombre.value = data.data.nombre_completo || '';
    if (email)  email.value  = data.data.email || '';
    liveUpdateSAHeader();
    if (data.data.foto_perfil) {
      const img = document.getElementById('profile-avatar-img');
      if (img) { img.src = data.data.foto_perfil; img.style.display = 'block'; }
      const ini = document.getElementById('profile-avatar-initials');
      if (ini) ini.style.display = 'none';
      const av = document.getElementById('topbar-av');
      if (av) { av.style.backgroundImage = 'url('+data.data.foto_perfil+')'; av.style.backgroundSize = 'cover'; av.textContent = ''; }
    }
  } catch (e) { console.warn('cargarPerfilSA:', e); }
}

function liveUpdateSAHeader() {
  const nombre   = (document.getElementById('sa-nombre')?.value || '').trim();
  const parts    = nombre.split(' ').filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : (parts[0]?.[0]?.toUpperCase() || 'SA');
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
    showToast('Perfil actualizado', 'success');
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
    if (av) { av.style.backgroundImage = 'url('+data.foto_url+')'; av.style.backgroundSize = 'cover'; av.textContent = ''; }
    showToast('Foto actualizada');
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
    ['sec-pass-act','sec-pass-new','sec-pass-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    showToast('Contraseña actualizada', 'success');
  } catch { showToast('Error de conexión.', 'error'); }
}

function toggleSecPass(inputId, iconId) {
  const inp = document.getElementById(inputId);
  const ico = document.getElementById(iconId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (ico) ico.className = inp.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
}

// ══ STATS GUARDIAS ══
async function cargarStatsGuardias() {
  try {
    const res  = await apiFetch('/parqueadero/guardias');
    if (!res) return;
    const data = await res.json();
    if (!data.ok) return;
    const activos = (data.data || []).filter(g => g.activo).length;
    const el = document.getElementById('stat-guardias');
    if (el) el.textContent = activos;
  } catch (e) { console.warn('stats guardias:', e); }
}

// ══ REGISTRAR USUARIO ══
async function registrarUsuario() {
  const nombre = document.getElementById('reg-nombre')?.value.trim();
  const tipoId = document.getElementById('reg-tipo-id')?.value;
  const numId  = document.getElementById('reg-num-id')?.value.trim();
  const email  = document.getElementById('reg-email')?.value.trim();
  const rol    = document.getElementById('reg-rol')?.value;
  const centro = document.getElementById('reg-centro')?.value;
  if (!nombre || !tipoId || !numId || !rol) { showToast('Completa los campos obligatorios.', 'error'); return; }
  try {
    const res  = await apiFetch('/auth/admin-register', {
      method:'POST', headers:{'Content-Type':'application/json'},
      // La contraseña temporal es el número de identificación del usuario
      body: JSON.stringify({ nombre_completo: nombre, tipo_id: tipoId, numero_id: numId, email: email||undefined, rol, id_centro: centro||undefined }),
    });
    if (!res) return;
    const data = await res.json();
    if (!data.ok) { showToast(data.message || (data.errors && data.errors[0]?.msg) || 'Error al registrar.', 'error'); return; }
    showToast(`✅ ${nombre} registrado como ${SA_ROL_LABELS[rol]||rol}. Contraseña temporal: ${numId}`, 'success');
    ['reg-nombre','reg-num-id','reg-email'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    const tipoEl = document.getElementById('reg-tipo-id'); if(tipoEl) tipoEl.value = '';
    const rolEl  = document.getElementById('reg-rol');     if(rolEl)  rolEl.value  = 'aprendiz';
    const cEl    = document.getElementById('reg-centro');  if(cEl)    cEl.innerHTML = '<option value="">Selecciona primero una región</option>';
    cargarUsuariosSA();
    cargarGuardias();
  } catch { showToast('Error de conexión.', 'error'); }
}

// ══ TABLA USUARIOS SUPERADMIN (con cambio de rol y activar/desactivar) ══
async function cargarUsuariosSA() {
  try {
    const res  = await apiFetch('/parqueadero/usuarios-superadmin');
    if (!res) return;
    const data = await res.json();
    if (data.ok && data.data) {
      saUsuarios = data.data.map(u => ({
        id:u.qr_code||'SIN-QR', id_usuario:u.id_usuario,
        nombre:u.nombre_completo||'Sin nombre', tipoId:u.tipo_id, numId:u.numero_id,
        email:u.email||null, rol:u.rol||'aprendiz', centro:u.centro_nombre||'No asignado',
        activo:u.activo, vehiculos:u.vehiculos||[],
      }));
      const el = document.getElementById('stat-usuarios-total');
      if (el) el.textContent = saUsuarios.filter(u => u.activo).length;
      renderSAUsersTable(saUsuarios);
    }
  } catch (e) { console.warn('usuarios-sa:', e); }
}

function renderSAUsersTable(list) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,0.4);padding:24px">Sin resultados</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(u => {
    const rolColor    = SA_ROL_COLORS[u.rol] || '#555';
    const rolLabel    = SA_ROL_LABELS[u.rol]  || u.rol;
    const estadoBadge = u.activo ? '<span class="event-badge in">Activo</span>' : '<span class="event-badge out">Inactivo</span>';
    const numMasked   = '*'.repeat(Math.max(0,(u.numId||'').length-4))+(u.numId||'').slice(-4);
    const rolesOpts   = ['aprendiz','funcionario','instructor','admin'].map(r =>
      '<option value="'+r+'"'+(u.rol===r?' selected':'')+'>'+SA_ROL_LABELS[r]+'</option>').join('');
    const toggleClass = u.activo ? 'sa-toggle-btn on' : 'sa-toggle-btn off';
    const toggleLabel = u.activo ? 'Desactivar' : 'Activar';
    const isSA        = u.rol === 'superadmin';
    const controles   = isSA
      ? '<span style="font-size:11px;color:rgba(255,255,255,0.3);">\u2014 superadmin \u2014</span>'
      : '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><select class="sa-rol-select" onchange="cambiarRol('+u.id_usuario+', this.value)">'+rolesOpts+'</select><button class="'+toggleClass+'" onclick="toggleUsuario('+u.id_usuario+', this)">'+toggleLabel+'</button></div>';
    return '<tr style="'+(u.activo?'':'opacity:0.5;')+'"><td><div class="user-cell"><div class="mini-av">'+u.nombre.split(' ').map(w=>w[0]).slice(0,2).join('')+'</div><span>'+u.nombre+'</span></div></td><td>'+u.tipoId+' \u00b7 '+numMasked+'</td><td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;background:'+rolColor+'22;border:0.5px solid '+rolColor+'55;color:'+rolColor+';">'+rolLabel+'</span></td><td class="centro-td">'+u.centro+'</td><td>'+estadoBadge+'</td><td>'+controles+'</td></tr>';
  }).join('');
}

function filterUsers() {
  const q       = document.getElementById('user-search')?.value.toLowerCase()  || '';
  const rolF    = document.getElementById('filter-rol')?.value                  || '';
  const estadoF = document.getElementById('filter-estado')?.value               || '';
  renderSAUsersTable(saUsuarios.filter(u => {
    const matchQ = u.nombre.toLowerCase().includes(q)||u.numId.includes(q)||u.id.toLowerCase().includes(q);
    return matchQ && (!rolF||u.rol===rolF) && (!estadoF||(estadoF==='activo'?u.activo:!u.activo));
  }));
}

async function toggleUsuario(id, btn) {
  if (btn) btn.disabled = true;
  try {
    const res  = await apiFetch('/parqueadero/usuarios/'+id+'/toggle', { method:'PUT' });
    if (!res) { if(btn) btn.disabled=false; return; }
    const data = await res.json();
    if (!data.ok) { showToast(data.message||'Error.','error'); if(btn) btn.disabled=false; return; }
    showToast(data.message, data.activo?'success':'info');
    await cargarUsuariosSA();
  } catch { showToast('Error de conexión.','error'); }
  if (btn) btn.disabled = false;
}

async function cambiarRol(id, nuevoRol) {
  openSAModal({
    icon:'🔄', title:'Cambiar rol',
    desc:'¿Deseas cambiar el rol de este usuario a <strong>'+(SA_ROL_LABELS[nuevoRol]||nuevoRol)+'</strong>?',
    btnClass:'ok', btnLabel:'Cambiar rol',
    onConfirm: async () => {
      try {
        const res  = await apiFetch('/parqueadero/usuarios/'+id+'/rol', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({rol:nuevoRol}) });
        if (!res) return;
        const data = await res.json();
        if (!data.ok) { showToast(data.message||'Error.','error'); return; }
        showToast(data.message,'success');
        await cargarUsuariosSA();
        await cargarGuardias();
      } catch { showToast('Error de conexión.','error'); }
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
    const activos   = guardias.filter(g =>  g.activo);
    const inactivos = guardias.filter(g => !g.activo);
    const totalHoy  = guardias.reduce((s,g)=>s+parseInt(g.registros_hoy||0),0);
    const setEl = (id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    setEl('stat-guardias',activos.length); setEl('g-activos',activos.length);
    setEl('g-inactivos',inactivos.length); setEl('g-registros-hoy',totalHoy);
    if (list) {
      if (!guardias.length) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);"><i class="bi bi-shield-x" style="font-size:36px;display:block;margin-bottom:12px;"></i>No hay guardias registrados. <button class="link-btn" onclick="showSection(\'registrar\',null)">Registra uno aquí</button></div>';
      } else {
        list.innerHTML = guardias.map(g=>renderGuardiaCard(g)).join('');
      }
    }
    if (dashList) {
      if (!activos.length) {
        dashList.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:13px;">Sin guardias activos</div>';
      } else {
        dashList.innerHTML = activos.slice(0,5).map(g=>'<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);"><div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1a3d1f,#2FA440);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;">'+g.nombre_completo.split(' ').map(w=>w[0]).slice(0,2).join('')+'</div><div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+g.nombre_completo+'</div><div style="font-size:11px;color:rgba(255,255,255,0.4);">'+parseInt(g.registros_hoy||0)+' registros hoy</div></div><span class="event-badge in" style="font-size:10px;">Activo</span></div>').join('');
      }
    }
  } catch (e) { console.warn('guardias:', e); }
}

function renderGuardiaCard(g) {
  const ini = g.nombre_completo.split(' ').map(w=>w[0]).slice(0,2).join('');
  const ult = g.ultimo_registro ? new Date(g.ultimo_registro).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'}) : 'Sin actividad';
  const tc  = g.activo ? 'g-btn g-btn-toggle-on' : 'g-btn g-btn-toggle-off';
  const tl  = g.activo ? '<i class="bi bi-toggle2-on"></i> Activo' : '<i class="bi bi-toggle2-off"></i> Inactivo';
  return '<div class="guardia-card '+(g.activo?'':'inactivo')+'" id="guardia-card-'+g.id_usuario+'"><div class="guardia-av">'+ini+'</div><div class="guardia-info"><p class="guardia-nombre">'+g.nombre_completo+'</p><div class="guardia-meta"><span><i class="bi bi-building"></i>'+(g.centro_nombre||'Sin centro')+'</span><span><i class="bi bi-clipboard-check"></i>'+parseInt(g.registros_hoy||0)+' registros hoy</span><span><i class="bi bi-clock-history"></i>Último: '+ult+'</span></div></div><div class="guardia-actions"><button class="'+tc+'" onclick="toggleGuardia('+g.id_usuario+', this)">'+tl+'</button><button class="g-btn g-btn-del" onclick="eliminarGuardia('+g.id_usuario+', \''+g.nombre_completo.replace(/'/g,"\\'")+'\')"><i class="bi bi-trash3"></i></button></div></div>';
}

async function toggleGuardia(id, btn) {
  if (btn) btn.disabled = true;
  try {
    const res  = await apiFetch('/parqueadero/guardias/'+id+'/toggle', {method:'PUT'});
    if (!res) { if(btn) btn.disabled=false; return; }
    const data = await res.json();
    if (!data.ok) { showToast(data.message||'Error.','error'); if(btn) btn.disabled=false; return; }
    showToast(data.message, data.activo?'success':'info');
    await cargarGuardias();
  } catch { showToast('Error de conexión.','error'); }
  if (btn) btn.disabled = false;
}

function eliminarGuardia(id, nombre) {
  openSAModal({
    icon:'⚠️', title:'Desactivar guardia',
    desc:'¿Seguro que deseas desactivar la cuenta de <strong>'+nombre+'</strong>? El guardia no podrá iniciar sesión.',
    btnClass:'danger', btnLabel:'Desactivar',
    onConfirm: async () => {
      try {
        const res  = await apiFetch('/parqueadero/guardias/'+id, {method:'DELETE'});
        if (!res) return;
        const data = await res.json();
        if (!data.ok) { showToast(data.message||'Error.','error'); return; }
        showToast('Guardia desactivado.','info');
        await cargarGuardias();
      } catch { showToast('Error de conexión.','error'); }
    },
  });
}

// ══ MODAL CONFIRMACIÓN ══
function openSAModal({ icon, title, desc, btnClass, btnLabel, onConfirm }) {
  document.getElementById('sa-modal-icon').textContent  = icon;
  document.getElementById('sa-modal-title').textContent = title;
  document.getElementById('sa-modal-desc').innerHTML    = desc;
  const btn = document.getElementById('sa-modal-confirm-btn');
  btn.className = 'sa-modal-confirm '+btnClass;
  btn.textContent = btnLabel;
  saModalCb = onConfirm;
  btn.onclick = async () => { closeSAModal(); if (saModalCb) await saModalCb(); };
  document.getElementById('sa-confirm-modal').classList.add('visible');
}

function closeSAModal() {
  document.getElementById('sa-confirm-modal').classList.remove('visible');
  saModalCb = null;
}

// ══ EXPORTAR EXCEL (versión SA — color púrpura) ══
function exportarAdminExcel() {
  if (!haRegistros.length) { showToast('No hay registros para exportar','error'); return; }
  const cols = ['#','Usuario','Vehículo','Identificador','Lado','Entrada','Salida','Duración','Estado'];
  const rows = haRegistros.map((r,i) => [
    i+1, r.nombre_completo||'—', r.tipo_vehiculo||'—', r.identificador||'—', r.lado||'—',
    new Date(r.fecha_entrada).toLocaleString('es-CO',{timeZone:'America/Bogota'}),
    r.fecha_salida ? new Date(r.fecha_salida).toLocaleString('es-CO',{timeZone:'America/Bogota'}) : '—',
    r.duracion_min!=null?(r.duracion_min>=60?Math.floor(r.duracion_min/60)+'h '+Math.round(r.duracion_min%60)+'m':Math.round(r.duracion_min)+'m'):'—',
    r.estado==='completado'?'Completado':'En curso',
  ]);
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table><tr><td colspan="'+cols.length+'" style="background:#7b1fa2;color:#fff;font-size:15pt;font-weight:700;padding:10pt;">Parksmart — Historial (Superadmin)</td></tr><tr>'+cols.map(c=>'<td style="background:#4a148c;color:#fff;font-weight:700;padding:7pt 10pt;">'+c+'</td>').join('')+'</tr>'+rows.map(r=>'<tr>'+r.map(v=>'<td style="padding:6pt 10pt;border:0.5pt solid #e1bee7;">'+v+'</td>').join('')+'</tr>').join('')+'</table></body></html>';
  const blob = new Blob(['\uFEFF'+html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Parksmart_SA_'+new Date().toISOString().slice(0,10)+'.xls';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Excel exportado','success');
}

// ══ OVERRIDES — neutraliza funciones del admin que causarían crash en superadmin ══
// Se ejecutan DESPUÉS de que admin-cupos/datos/scanner los definen, sobreescribiéndolos.
// Esto permite reutilizar toda la lógica compartida sin que fallen en el contexto SA.

// cargarPerfilAdmin → en superadmin usamos cargarPerfilSA (ya invocado en el init SA)
async function cargarPerfilAdmin() { /* no-op: superadmin usa cargarPerfilSA */ }

// updateAdminAvatar → en superadmin no hay #admin-avatar ni #admin-display-name
function updateAdminAvatar(nombre) {
  // Redirige al header del superadmin
  liveUpdateSAHeader();
}

// cargarUsuariosDesdeAPI → en superadmin usamos cargarUsuariosSA (tabla con roles)
// Esta función es llamada por admin-cupos.js en su DOMContentLoaded.
// La sobreescribimos para que SIEMPRE use el endpoint de superadmin.
async function cargarUsuariosDesdeAPI() {
  await cargarUsuariosSA();
}

// renderUsersTable → usada por cargarUsuariosDesdeAPI del admin; en SA usa la versión SA
// La capturamos para evitar que pinte columnas incorrectas en la tabla SA
function renderUsersTable(list) {
  try { renderSAUsersTable(list); } catch(e) { /* tabla SA ya inicializada por cargarUsuariosSA */ }
}

// filterCentrosAdmin → en superadmin no hay #a-region ni #a-centro (son #reg-region, #reg-centro)
function filterCentrosAdmin() { /* no-op en superadmin */ }

// showSection → override para también recargar guardias/usuarios SA
function showSection(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('section-' + name);
  if (sec) sec.classList.add('active');
  document.querySelectorAll(".nav-item[onclick*=\"'" + name + "'\"]").forEach(el => el.classList.add('active'));
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
  if (name !== 'scanner') { if (typeof stopScan === 'function') stopScan(); }
  if (name === 'historia') { if (typeof initHistorialAdmin === 'function') initHistorialAdmin(); }
  if (name === 'guardias') cargarGuardias();
  if (name === 'usuarios') cargarUsuariosSA();
  // Al entrar al dashboard, refrescar gráficas y stats de cupos
  if (name === 'dashboard') {
    if (typeof cargarStatsAvanzados === 'function') cargarStatsAvanzados();
    if (typeof cargarCuposDesdeAPI  === 'function') cargarCuposDesdeAPI();
    cargarGuardias();
  }
}

// startClock → en admin usa #live-time; en superadmin usa #sa-clock
function startClock() {
  function tick() {
    const now = new Date();
    const el  = document.getElementById('sa-clock');
    if (el) el.textContent = now.toLocaleString('es-CO', { dateStyle:'long', timeStyle:'short', timeZone:'America/Bogota' });
  }
  tick();
  setInterval(tick, 1000);
}