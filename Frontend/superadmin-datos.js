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
  if (name === 'metricas') cargarMetricas();
  if (name === 'alertas')  cargarAlertas();
  if (name === 'auditoria') { cargarAuditoria(); }
  if (name === 'busqueda') {
    const inp = document.getElementById('global-search-input');
    if (inp && !inp.value) {
      const cont = document.getElementById('busqueda-resultados');
      if (cont) cont.innerHTML = '<div style="text-align:center;padding:60px;color:rgba(255,255,255,0.25);"><i class="bi bi-search" style="font-size:40px;display:block;margin-bottom:12px;"></i>Escribe al menos 2 caracteres para buscar</div>';
    }
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
// ════════════════════════════════════════════════════════════
// ══ MÓDULOS AZULES — IMPLEMENTACIÓN COMPLETA ══
// ════════════════════════════════════════════════════════════

// ── Helpers compartidos ───────────────────────────────────────────────
function fmtDur(min) {
  if (min == null) return '—';
  const m = Math.round(min);
  return m >= 60 ? Math.floor(m/60)+'h '+Math.round(m%60)+'m' : m+'m';
}
function fmtDT(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'});
}
function fmtHora(h) {
  if (h == null) return '?';
  const hh = Number(h);
  return hh === 0 ? '12 AM' : hh < 12 ? hh+'AM' : hh === 12 ? '12PM' : (hh-12)+'PM';
}

// ═══════════════════════════════════════════════
// ══ 1. DASHBOARD DE MÉTRICAS ══
// ═══════════════════════════════════════════════
// ── Chart instances para Análisis ─────────────────────────────────────
const _analCharts = {};
function _destroyChart(id) { if (_analCharts[id]) { _analCharts[id].destroy(); delete _analCharts[id]; } }

const CHART_DEFAULTS = {
  color: 'rgba(255,255,255,0.7)',
  grid:  'rgba(255,255,255,0.06)',
  font:  { family: 'DM Sans, sans-serif', size: 11 },
};

function _mkLineChart(id, labels, data, label, color) {
  _destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  _analCharts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label, data, borderColor: color, backgroundColor: color.replace(')', ',0.12)').replace('rgb','rgba'),
        tension: 0.4, fill: true, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: ctx => ` ${ctx.parsed.y} ingresos`
      }}},
      scales: {
        x: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, maxRotation:45 },
             grid: { color: CHART_DEFAULTS.grid } },
        y: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font, precision:0 },
             grid: { color: CHART_DEFAULTS.grid }, beginAtZero: true }
      }
    }
  });
}

function _mkBarChart(id, labels, data, colors, horizontal) {
  _destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  _analCharts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors,
      borderRadius: 6, borderSkipped: false }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font },
             grid: { color: CHART_DEFAULTS.grid }, beginAtZero: true },
        y: { ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font },
             grid: { color: CHART_DEFAULTS.grid }, beginAtZero: true }
      }
    }
  });
}

function _mkDonutChart(id, labels, data, colors) {
  _destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  _analCharts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2,
      borderColor: 'rgba(0,0,0,0.3)', hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: ctx => ` ${ctx.label}: ${ctx.parsed} vehículos`
      }}}
    }
  });
}

async function cargarMetricas() {
  try {
    const res  = await apiFetch('/parqueadero/metricas');
    if (!res) return;
    const data = await res.json();
    if (!data.ok) { showToast(data.message || 'Error cargando análisis', 'error'); return; }
    const { usuarios, vehiculos, registros, picos_hora, por_tipo } = data.data;

    // ── KPIs ─────────────────────────────────────────────────────────
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '0'; };
    set('met-total-activos',   usuarios.total_activos);
    set('met-total-vehiculos', vehiculos.total_vehiculos);
    set('met-reg-hoy',         registros.hoy);
    set('met-reg-7d',          registros.ultimos_7_dias);
    set('met-reg-30d',         registros.ultimos_30_dias);
    set('met-nuevos-hoy',      usuarios.nuevos_hoy);

    const periodo = parseInt(document.getElementById('anal-periodo')?.value || '30');
    const labelEl = document.getElementById('anal-periodo-label');
    if (labelEl) labelEl.textContent = `(últimos ${periodo} días)`;

    // ── Chart 1: Ingresos por hora (horas pico como histograma 24h) ──
    const horasLabels = Array.from({length:24},(_,i)=>i.toString().padStart(2,'0')+':00');
    const horasData   = new Array(24).fill(0);
    (picos_hora || []).forEach(p => {
      const h = parseInt(p.hora);
      if (h >= 0 && h < 24) horasData[h] = Number(p.total) || 0;
    });
    const maxHora = Math.max(...horasData) || 1;
    const horaColors = horasData.map(v => {
      const pct = v / maxHora;
      if (pct > 0.75) return 'rgba(255,100,80,0.85)';
      if (pct > 0.4)  return 'rgba(255,193,7,0.75)';
      return 'rgba(33,150,243,0.6)';
    });
    _mkBarChart('chartAnalHora', horasLabels, horasData, horaColors, false);

    // ── Chart 2: Ingresos diarios — usando datos reales del backend ──────
    const { ingresos_diarios = [], por_dia_semana = [] } = data.data;
    const diaNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    let diasLabels, diasData;
    if (ingresos_diarios.length) {
      // Datos reales: mostrar últimos 30 días
      diasLabels = ingresos_diarios.map(d => {
        const fecha = new Date(d.dia);
        return `${fecha.getDate()}/${fecha.getMonth()+1}`;
      });
      diasData = ingresos_diarios.map(d => Number(d.total) || 0);
    } else {
      // Fallback con datos disponibles
      const hoy = new Date();
      diasLabels = []; diasData = [];
      const total7d = Number(registros.ultimos_7_dias) || 0;
      const weights = [0.08, 0.16, 0.17, 0.18, 0.17, 0.16, 0.08];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(hoy); d.setDate(hoy.getDate() - i);
        diasLabels.push(i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : diaNames[d.getDay()]);
        diasData.push(i === 0 ? (Number(registros.hoy)||0) : Math.round(total7d * weights[d.getDay()]));
      }
    }
    _mkLineChart('chartAnalDias', diasLabels, diasData, 'Ingresos', 'rgb(47,164,64)');

    // ── Chart 3: Donut vehículos ──────────────────────────────────────
    const vColores = ['#42a5f5','#66bb6a','#ffa726','#ab47bc','#ef5350','#78909c'];
    const vLabels  = (por_tipo||[]).map(t=>t.tipo);
    const vData    = (por_tipo||[]).map(t=>Number(t.total)||0);
    const vColors  = vLabels.map((_,i)=>vColores[i%vColores.length]);
    _mkDonutChart('chartAnalDonut', vLabels, vData, vColors);

    // Leyenda manual del donut
    const totalVeh = vData.reduce((a,b)=>a+b,0)||1;
    const legendEl = document.getElementById('anal-donut-legend');
    if (legendEl) legendEl.innerHTML = vLabels.map((l,i) => {
      const pct = Math.round(vData[i]/totalVeh*100);
      return `<div style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${vColors[i]};flex-shrink:0;"></span>
        <span style="font-size:12px;color:rgba(255,255,255,0.7);flex:1;">${l}</span>
        <span style="font-size:12px;font-weight:600;color:#fff;">${pct}%</span>
      </div>`;
    }).join('');

    // ── Chart 4: Roles barras horizontales ───────────────────────────
    const rolesDef = [
      { label:'Aprendices',   val: Number(usuarios.aprendices||0),   color:'rgba(33,150,243,0.75)'  },
      { label:'Funcionarios', val: Number(usuarios.funcionarios||0), color:'rgba(76,175,80,0.75)'   },
      { label:'Instructores', val: Number(usuarios.instructores||0), color:'rgba(156,39,176,0.75)'  },
      { label:'Guardias',     val: Number(usuarios.guardias||0),     color:'rgba(255,152,0,0.75)'   },
    ];
    _mkBarChart('chartAnalRoles',
      rolesDef.map(r=>r.label),
      rolesDef.map(r=>r.val),
      rolesDef.map(r=>r.color),
      true
    );

    // ── Chart 5: Día de la semana — datos reales (dow 0=Dom … 6=Sáb) ────
    const semDays = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    // dow: 0=Dom,1=Lun,...,6=Sáb  →  reordenar a Lun-Dom
    const dowMap = new Array(7).fill(0);
    por_dia_semana.forEach(r => { dowMap[Number(r.dow)] = Number(r.total)||0; });
    // Reordenar: Lun(1),Mar(2),Mié(3),Jue(4),Vie(5),Sáb(6),Dom(0)
    const semData = [1,2,3,4,5,6,0].map(i => dowMap[i]);
    const semHasData = semData.some(v => v > 0);
    const semDataFinal = semHasData ? semData : (() => {
      const total30 = Number(registros.ultimos_30_dias)||0;
      return [0.19,0.19,0.19,0.19,0.15,0.05,0.04].map(w => Math.round(total30*w/4));
    })();
    _mkBarChart('chartAnalSemana', semDays, semDataFinal,
      semDays.map((_,i)=> i < 5 ? 'rgba(47,164,64,0.7)' : 'rgba(255,152,0,0.6)'),
      false);

    // ── Horas pico ranking ────────────────────────────────────────────
    const picoEl = document.getElementById('anal-picos-list');
    if (picoEl) {
      const sorted = [...(picos_hora||[])].sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,5);
      if (!sorted.length) {
        picoEl.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:20px;">Sin datos suficientes</p>';
      } else {
        const maxVal = Number(sorted[0].total) || 1;
        const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
        picoEl.innerHTML = sorted.map((p,i) => {
          const pct = Math.round(Number(p.total)/maxVal*100);
          return `<div class="anal-pico-row">
            <span class="anal-pico-rank">${medals[i]}</span>
            <div class="anal-pico-info">
              <div class="anal-pico-hora">${fmtHora(p.hora)}</div>
              <div class="anal-pico-sub">hora del día</div>
            </div>
            <div class="anal-pico-bar-wrap">
              <div class="anal-pico-bar-track"><div class="anal-pico-bar-fill" style="width:${pct}%;"></div></div>
            </div>
            <span class="anal-pico-count">${p.total}</span>
          </div>`;
        }).join('');
      }
    }

    // ── Tabla vehículos detallada ─────────────────────────────────────
    const vehTbody = document.getElementById('anal-veh-tbody');
    if (vehTbody) {
      const tvTotal = vData.reduce((a,b)=>a+b,0)||1;
      vehTbody.innerHTML = (por_tipo||[]).map((t,i) => {
        const pct = Math.round(Number(t.total)/tvTotal*100);
        return `<tr>
          <td><span style="display:inline-flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${vColors[i]||'#78909c'};"></span>
            ${t.tipo}
          </span></td>
          <td>${t.total}</td>
          <td>${pct}%</td>
          <td><div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.07);overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${vColors[i]||'#78909c'};border-radius:3px;"></div>
          </div></td>
        </tr>`;
      }).join('') || '<tr><td colspan="4" style="text-align:center;opacity:.4;padding:20px;">Sin datos</td></tr>';
    }

  } catch (e) { console.warn('analisis:', e); showToast('Error cargando análisis.', 'error'); }
}


async function cargarAlertas() {
  const cont = document.getElementById('alertas-container');
  if (!cont) return;
  cont.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.4);">
    <i class="bi bi-hourglass-split" style="font-size:28px;display:block;margin-bottom:10px;"></i>Verificando sistema...
  </div>`;
  try {
    const res  = await apiFetch('/parqueadero/alertas');
    if (!res) return;
    const data = await res.json();
    if (!data.ok) { cont.innerHTML = `<div style="padding:20px;color:#ef9a9a;">${data.message}</div>`; return; }
    const { alertas } = data.data;

    // Badge en nav
    const badge = document.getElementById('nav-alert-badge');
    if (badge) {
      if (alertas.length > 0) {
        badge.style.display = 'flex';
        badge.textContent   = alertas.length > 9 ? '9+' : alertas.length;
      } else {
        badge.style.display = 'none';
      }
    }

    if (!alertas.length) {
      cont.innerHTML = `<div style="text-align:center;padding:60px;color:rgba(255,255,255,0.3);">
        <i class="bi bi-shield-check" style="font-size:48px;display:block;margin-bottom:14px;color:rgba(76,175,80,0.6);"></i>
        <div style="font-size:16px;font-weight:600;color:rgba(255,255,255,0.5);">Todo en orden</div>
        <div style="font-size:13px;margin-top:6px;">No hay alertas activas en este momento</div>
      </div>`;
      return;
    }

    const nivelCfg = {
      critico:      { color:'#ef5350', bg:'rgba(239,83,80,0.12)', border:'rgba(239,83,80,0.35)', icon:'bi-exclamation-triangle-fill' },
      advertencia:  { color:'#ffa726', bg:'rgba(255,167,38,0.10)', border:'rgba(255,167,38,0.30)', icon:'bi-exclamation-circle-fill' },
      info:         { color:'#42a5f5', bg:'rgba(66,165,245,0.08)', border:'rgba(66,165,245,0.25)', icon:'bi-clock-history' },
    };

    cont.innerHTML = `
      <div style="display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap;">
        ${['critico','advertencia','info'].map(n => {
          const c = alertas.filter(a=>a.nivel===n).length;
          const cfg = nivelCfg[n];
          return `<div style="padding:12px 20px;border-radius:12px;background:${cfg.bg};border:1px solid ${cfg.border};display:flex;align-items:center;gap:10px;">
            <i class="bi ${cfg.icon}" style="color:${cfg.color};font-size:18px;"></i>
            <div><div style="font-size:20px;font-weight:700;color:#fff;">${c}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.45);">${n.charAt(0).toUpperCase()+n.slice(1)}</div></div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${alertas.map(a => {
          const cfg = nivelCfg[a.nivel] || nivelCfg.info;
          const hora = a.detalle?.fecha_entrada ? fmtDT(a.detalle.fecha_entrada) : '';
          const horas = a.detalle?.horas_dentro ? Math.floor(a.detalle.horas_dentro)+'h '+(Math.round((a.detalle.horas_dentro%1)*60))+'m' : '';
          return `<div style="padding:16px 20px;border-radius:14px;background:${cfg.bg};border:1px solid ${cfg.border};display:flex;align-items:flex-start;gap:14px;">
            <i class="bi ${cfg.icon}" style="color:${cfg.color};font-size:22px;margin-top:2px;flex-shrink:0;"></i>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;color:#fff;margin-bottom:4px;">${a.titulo}</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.6);">${a.descripcion}</div>
              ${hora ? `<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:5px;"><i class="bi bi-clock"></i> Entró: ${hora}${horas?' — lleva '+horas:''}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  } catch (e) { console.warn('alertas:', e); cont.innerHTML = '<div style="padding:20px;color:#ef9a9a;">Error de conexión.</div>'; }
}

// ═══════════════════════════════════════════════
// ══ 4. EXPORTAR REPORTES ══
// ═══════════════════════════════════════════════
let expRegistros = [];

async function previewExportar() {
  const desde = document.getElementById('exp-desde')?.value;
  const hasta = document.getElementById('exp-hasta')?.value;
  if (!desde || !hasta) { showToast('Selecciona el rango de fechas.', 'error'); return; }
  if (desde > hasta)    { showToast('La fecha "desde" debe ser anterior a "hasta".', 'error'); return; }
  const preview = document.getElementById('exp-preview');
  const tbody   = document.getElementById('exp-tbody');
  const count   = document.getElementById('exp-count');
  const title   = document.getElementById('exp-preview-title');
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;opacity:.5;"><i class="bi bi-hourglass-split"></i> Cargando...</td></tr>`;
  if (preview) preview.style.display = 'block';
  try {
    const res  = await apiFetch(`/parqueadero/exportar?desde=${desde}&hasta=${hasta}`);
    if (!res) return;
    const data = await res.json();
    if (!data.ok) { showToast(data.message || 'Error al obtener datos.', 'error'); if(preview) preview.style.display='none'; return; }
    expRegistros = data.data;
    if (title) title.textContent = `Registros del ${desde} al ${hasta} (${expRegistros.length})`;
    if (count) count.textContent = `${expRegistros.length} registros encontrados`;
    if (!tbody) return;
    if (!expRegistros.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;opacity:.5;">Sin registros en ese rango</td></tr>`;
      return;
    }
    tbody.innerHTML = expRegistros.map((r,i) => `<tr>
      <td>${i+1}</td>
      <td>${r.nombre_completo||'—'}</td>
      <td style="font-size:11px;">${r.tipo_id||''} ${r.numero_id||''}</td>
      <td>${r.tipo_vehiculo||'—'}</td>
      <td style="font-size:11px;">${r.identificador||'—'} ${r.color?'· '+r.color:''}</td>
      <td>${r.lado||'—'}</td>
      <td style="font-size:11px;">${fmtDT(r.fecha_entrada)}</td>
      <td style="font-size:11px;">${fmtDT(r.fecha_salida)}</td>
      <td>${fmtDur(r.duracion_min)}</td>
      <td>${r.estado==='completado'?'<span class="event-badge in">Completado</span>':'<span class="event-badge out">En curso</span>'}</td>
    </tr>`).join('');
  } catch (e) { console.warn('exportar preview:', e); showToast('Error de conexión.', 'error'); }
}

function exportarCSV() {
  if (!expRegistros.length) { showToast('Primero previsualiza los datos.', 'error'); return; }
  const cols = ['#','Nombre','Documento','Rol','Tipo Vehículo','Identificador','Color','Lado','Entrada','Salida','Duración (min)','Estado'];
  const rows = expRegistros.map((r,i) => [
    i+1, r.nombre_completo||'', `${r.tipo_id||''} ${r.numero_id||''}`.trim(), r.rol||'',
    r.tipo_vehiculo||'', r.identificador||'', r.color||'', r.lado||'',
    r.fecha_entrada ? new Date(r.fecha_entrada).toLocaleString('es-CO',{timeZone:'America/Bogota'}) : '',
    r.fecha_salida  ? new Date(r.fecha_salida).toLocaleString('es-CO',{timeZone:'America/Bogota'})  : '',
    r.duracion_min != null ? Math.round(r.duracion_min) : '',
    r.estado==='completado' ? 'Completado' : 'En curso',
  ]);
  const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Parksmart_${document.getElementById('exp-desde')?.value}_${document.getElementById('exp-hasta')?.value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('CSV descargado', 'success');
}

function exportarExcelRango() {
  if (!expRegistros.length) { showToast('Primero previsualiza los datos.', 'error'); return; }
  const desde = document.getElementById('exp-desde')?.value || '';
  const hasta = document.getElementById('exp-hasta')?.value || '';
  const cols  = ['#','Nombre','Documento','Rol','Tipo Vehículo','Identificador','Color','Lado','Entrada','Salida','Duración','Estado'];
  const rows  = expRegistros.map((r,i) => [
    i+1, r.nombre_completo||'—', `${r.tipo_id||''} ${r.numero_id||''}`.trim(), r.rol||'—',
    r.tipo_vehiculo||'—', r.identificador||'—', r.color||'—', r.lado||'—',
    r.fecha_entrada ? new Date(r.fecha_entrada).toLocaleString('es-CO',{timeZone:'America/Bogota'}) : '—',
    r.fecha_salida  ? new Date(r.fecha_salida).toLocaleString('es-CO',{timeZone:'America/Bogota'})  : '—',
    fmtDur(r.duracion_min),
    r.estado==='completado' ? 'Completado' : 'En curso',
  ]);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head><body><table>
    <tr><td colspan="${cols.length}" style="background:#4a148c;color:#fff;font-size:15pt;font-weight:700;padding:10pt;">
      Parksmart — Registros ${desde} al ${hasta}
    </td></tr>
    <tr>${cols.map(c=>`<td style="background:#6a1b9a;color:#fff;font-weight:700;padding:7pt 10pt;">${c}</td>`).join('')}</tr>
    ${rows.map(r=>`<tr>${r.map(v=>`<td style="padding:6pt 10pt;border:0.5pt solid #e1bee7;">${v}</td>`).join('')}</tr>`).join('')}
    </table></body></html>`;
  const blob = new Blob(['\uFEFF'+html], {type:'application/vnd.ms-excel;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Parksmart_${desde}_${hasta}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Excel descargado', 'success');
}

// ══ showSection extendido — ver bloque showSection arriba para módulos nuevos ══

// Cargar alertas al inicio para mostrar el badge en el nav
document.addEventListener('DOMContentLoaded', () => {
  cargarAlertas();
  // Poner fecha de hoy por defecto en exportar
  const hoy = new Date().toISOString().slice(0,10);
  const expHasta = document.getElementById('exp-hasta');
  const expDesde = document.getElementById('exp-desde');
  if (expHasta) expHasta.value = hoy;
  if (expDesde) {
    const d = new Date(); d.setDate(d.getDate()-7);
    expDesde.value = d.toISOString().slice(0,10);
  }
  setInterval(cargarAlertas, 300000); // refrescar alertas cada 5 min
  // Fechas por defecto en auditoría (últimos 7 días)
  const audHoy = new Date().toISOString().slice(0,10);
  const audHasta = document.getElementById('aud-hasta');
  const audDesde = document.getElementById('aud-desde');
  if (audHasta) audHasta.value = audHoy;
  if (audDesde) { const d7 = new Date(); d7.setDate(d7.getDate()-7); audDesde.value = d7.toISOString().slice(0,10); }
});

// ═══════════════════════════════════════════════
// ══ 5. LOG DE AUDITORÍA ══
// ═══════════════════════════════════════════════
let _audRegistros = [];
const AUD_PER_PAGE = 30;
let _audPage = 1;

const AUD_TIPO_CFG = {
  entrada:  { icon:'bi-box-arrow-in-right', color:'#42a5f5', label:'Entrada'   },
  salida:   { icon:'bi-box-arrow-right',    color:'#66bb6a', label:'Salida'    },
  registro: { icon:'bi-person-plus-fill',   color:'#ce93d8', label:'Registro'  },
  rol:      { icon:'bi-shuffle',            color:'#ffa726', label:'Cambio Rol'},
  toggle:   { icon:'bi-toggle2-on',         color:'#78909c', label:'Activar/Des'},
};

async function cargarAuditoria() {
  const desde = document.getElementById('aud-desde')?.value;
  const hasta  = document.getElementById('aud-hasta')?.value;
  const tipo   = document.getElementById('aud-filtro-tipo')?.value || '';
  const q      = document.getElementById('aud-buscar')?.value || '';
  const tbody  = document.getElementById('aud-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;opacity:.45;"><i class="bi bi-hourglass-split"></i> Cargando...</td></tr>`;
  try {
    let url = '/parqueadero/auditoria?';
    if (desde) url += `desde=${desde}&`;
    if (hasta)  url += `hasta=${hasta}&`;
    if (tipo)   url += `tipo=${tipo}&`;
    if (q.trim().length >= 2) url += `q=${encodeURIComponent(q.trim())}`;
    const res  = await apiFetch(url);
    if (!res) return;
    const data = await res.json();
    if (!data.ok) { showToast(data.message || 'Error cargando auditoría', 'error'); return; }
    _audRegistros = data.data;
    _audPage = 1;
    renderAuditoria();
  } catch (e) { console.warn('auditoria:', e); showToast('Error de conexión.', 'error'); }
}

function filtrarAuditoria() {
  clearTimeout(window._audTimer);
  window._audTimer = setTimeout(cargarAuditoria, 400);
}

function renderAuditoria() {
  const tbody    = document.getElementById('aud-tbody');
  const countEl  = document.getElementById('aud-count');
  const pageInfo = document.getElementById('aud-page-info');
  const pageBtns = document.getElementById('aud-page-btns');
  if (!tbody) return;

  const total   = _audRegistros.length;
  const pages   = Math.max(1, Math.ceil(total / AUD_PER_PAGE));
  _audPage      = Math.min(_audPage, pages);
  const start   = (_audPage - 1) * AUD_PER_PAGE;
  const slice   = _audRegistros.slice(start, start + AUD_PER_PAGE);

  if (countEl)  countEl.textContent  = total + ' eventos';
  if (pageInfo) pageInfo.textContent = `Página ${_audPage} de ${pages} · ${total} resultados`;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;opacity:.4;"><i class="bi bi-journal-x" style="font-size:28px;display:block;margin-bottom:10px;"></i>Sin eventos en este rango</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(e => {
      const cfg   = AUD_TIPO_CFG[e.tipo_accion] || { icon:'bi-dot', color:'#aaa', label: e.tipo_accion };
      const fecha = fmtDT(e.fecha);
      const rolBadge = e.actor_rol && e.actor_rol !== 'sistema'
        ? `<span style="font-size:10px;padding:1px 7px;border-radius:20px;background:${SA_ROL_COLORS[e.actor_rol]||'#555'}22;color:${SA_ROL_COLORS[e.actor_rol]||'#aaa'};border:0.5px solid ${SA_ROL_COLORS[e.actor_rol]||'#555'}44;">${SA_ROL_LABELS[e.actor_rol]||e.actor_rol}</span>`
        : '';
      return `<tr>
        <td style="font-size:11px;color:rgba(255,255,255,0.55);white-space:nowrap;">${fecha}</td>
        <td>
          <div style="font-size:13px;color:#fff;">${e.actor||'—'}</div>
          <div style="display:flex;gap:5px;align-items:center;margin-top:2px;">
            ${e.actor_doc ? `<span style="font-size:11px;color:rgba(255,255,255,0.35);">${e.actor_doc}</span>` : ''}
            ${rolBadge}
          </div>
        </td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;background:${cfg.color}18;border:0.5px solid ${cfg.color}44;color:${cfg.color};">
            <i class="bi ${cfg.icon}"></i> ${cfg.label}
          </span>
        </td>
        <td style="font-size:13px;color:rgba(255,255,255,0.8);">${e.afectado||'—'}</td>
        <td style="font-size:12px;color:rgba(255,255,255,0.45);">${e.detalle||'—'}</td>
      </tr>`;
    }).join('');
  }

  // Paginación
  if (pageBtns) {
    let btns = '';
    btns += `<button onclick="audGoPage(${_audPage-1})" ${_audPage===1?'disabled':''} style="padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);cursor:pointer;font-size:12px;" ${_audPage===1?'style="opacity:.4"':''}>‹ Ant</button>`;
    for (let p = Math.max(1,_audPage-2); p <= Math.min(pages,_audPage+2); p++) {
      btns += `<button onclick="audGoPage(${p})" style="padding:5px 12px;border-radius:8px;border:1px solid ${p===_audPage?'rgba(156,39,176,0.6)':'rgba(255,255,255,0.18)'};background:${p===_audPage?'rgba(156,39,176,0.25)':'rgba(255,255,255,0.06)'};color:#fff;cursor:pointer;font-size:12px;font-weight:${p===_audPage?'700':'400'};">${p}</button>`;
    }
    btns += `<button onclick="audGoPage(${_audPage+1})" ${_audPage===pages?'disabled':''} style="padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);cursor:pointer;font-size:12px;">Sig ›</button>`;
    pageBtns.innerHTML = btns;
  }
}

function audGoPage(p) {
  const pages = Math.max(1, Math.ceil(_audRegistros.length / AUD_PER_PAGE));
  if (p < 1 || p > pages) return;
  _audPage = p;
  renderAuditoria();
  document.getElementById('section-auditoria')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function exportarAuditoriaCSV() {
  if (!_audRegistros.length) { showToast('Primero carga el log.', 'error'); return; }
  const cols = ['Fecha','Actor','Documento','Rol','Tipo Acción','Afectado','Detalle'];
  const rows = _audRegistros.map(e => [
    e.fecha ? new Date(e.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'}) : '',
    e.actor||'', e.actor_doc||'', e.actor_rol||'',
    AUD_TIPO_CFG[e.tipo_accion]?.label || e.tipo_accion,
    e.afectado||'', e.detalle||'',
  ]);
  const csv = [cols,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Auditoria_Parksmart_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('CSV de auditoría descargado', 'success');
}
// ════════════════════════════════════════════════════════════
// ══ GESTIÓN DE PARQUEADERO (superadmin) ══
// ════════════════════════════════════════════════════════════
// Estado local en memoria — espejo de lo que devuelve el backend.
// Mientras el backend real no tenga endpoints de gestión de lados,
// se usa localStorage como persistencia provisional (mismo dominio).
// Cuando el backend esté listo, reemplazar pkLoad/pkSave con apiFetch.

const PK_STORE_KEY = 'parksmart_pk_config';

// ─── Estructura de dato por defecto (migrada del CIGEC actual) ────────
function pkDefaultCentroConfig(id_centro) {
  // El CIGEC (id=1) ya tiene Lado A y Lado B activos.
  // Cualquier otro centro arranca sin lados.
  if (String(id_centro) === '1') {
    return {
      id_centro,
      lados: [
        {
          id: 'lado-1',
          nombre: 'Lado A',
          habilitado: true,
          modo: 'controlado',        // 'controlado' | 'libre'
          capacidad: 21,
          tipos: ['Bicicleta', 'Moto', 'Carro'],
        },
        {
          id: 'lado-2',
          nombre: 'Lado B',
          habilitado: true,
          modo: 'libre',
          capacidad: null,
          tipos: ['Bicicleta', 'Moto', 'Carro'],
        },
      ],
    };
  }
  return { id_centro, lados: [] };
}

function pkLoad(id_centro) {
  try {
    const raw = localStorage.getItem(PK_STORE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[String(id_centro)] || pkDefaultCentroConfig(id_centro);
  } catch { return pkDefaultCentroConfig(id_centro); }
}

function pkSave(config) {
  try {
    const raw = localStorage.getItem(PK_STORE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[String(config.id_centro)] = config;
    localStorage.setItem(PK_STORE_KEY, JSON.stringify(all));
  } catch { showToast('No se pudo guardar la configuración.', 'error'); }
}

// ─── Estado activo ────────────────────────────────────────────────────
let pkConfig     = null;  // config del centro seleccionado
let pkOcupacion  = {};    // { [id_lado]: { carros, motos, bicicletas } }
let pkModalCtx   = null;  // { mode:'edit'|'add', ladoId? }

const TIPOS_DISPONIBLES = ['Bicicleta', 'Moto', 'Carro'];
const TIPO_ICONS = { Bicicleta: 'bi-bicycle', Moto: 'bi-scooter', Carro: 'bi-car-front-fill' };

// ─── Inicialización ───────────────────────────────────────────────────
async function pkInit() {
  await pkCargarSelectCentros();
  // Seleccionar el primer centro disponible
  const sel = document.getElementById('pk-centro-select');
  if (sel && sel.options.length > 1) {
    sel.selectedIndex = 1;
    await pkCargarCentro();
  }
}

async function pkCargarSelectCentros() {
  try {
    const res  = await apiFetch('/catalogos/centros');
    if (!res) return;
    const data = await res.json();
    const sel  = document.getElementById('pk-centro-select');
    if (!sel || !data.ok) return;
    sel.innerHTML = '<option value="">— Selecciona un centro —</option>' +
      (data.data || []).map(c =>
        `<option value="${c.id_centro}">${c.nombre}</option>`
      ).join('');
  } catch (e) { console.warn('pkCargarSelectCentros:', e); }
}

async function pkCargarCentro() {
  const sel = document.getElementById('pk-centro-select');
  const id  = sel?.value;
  if (!id) {
    document.getElementById('pk-lados-container').innerHTML =
      `<div style="text-align:center;padding:60px;color:rgba(255,255,255,0.3);">
        <i class="bi bi-building" style="font-size:36px;display:block;margin-bottom:12px;"></i>
        Selecciona un centro de formación
      </div>`;
    return;
  }

  pkConfig = pkLoad(id);

  // Traer ocupación real desde el backend (registros activos)
  try {
    const res  = await apiFetch('/parqueadero/ocupacion-rol');
    if (res) {
      const data = await res.json();
      if (data.ok && data.data) {
        const { lado_a, lado_b } = data.data;
        pkOcupacion = {
          'lado-1': {
            carros:      lado_a?.carros      || 0,
            motos:       lado_a?.motos       || 0,
            bicicletas:  lado_a?.bicicletas  || 0,
            ocupados:    lado_a?.ocupados    || 0,
          },
          'lado-2': {
            carros:      lado_b?.carros      || 0,
            motos:       lado_b?.motos       || 0,
            bicicletas:  lado_b?.bicicletas  || 0,
            ocupados:    (lado_b?.carros||0) + (lado_b?.motos||0),
          },
        };
      }
    }
  } catch {}

  pkRenderLados();
}

// ─── Render principal ─────────────────────────────────────────────────
function pkRenderLados() {
  const cont = document.getElementById('pk-lados-container');
  if (!cont) return;

  if (!pkConfig || !pkConfig.lados.length) {
    cont.innerHTML = `
      <div class="glass-panel" style="text-align:center;padding:40px;">
        <i class="bi bi-p-circle" style="font-size:40px;color:rgba(255,255,255,0.25);display:block;margin-bottom:14px;"></i>
        <div style="font-size:15px;color:rgba(255,255,255,0.5);margin-bottom:8px;">Este centro no tiene lados configurados</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.3);margin-bottom:20px;">Agrega un lado para empezar a gestionar el parqueadero</div>
        <button class="btn-save" onclick="pkAgregarLado()" style="padding:10px 22px;font-size:13px;">
          <i class="bi bi-plus-circle-fill"></i> Agregar primer lado
        </button>
      </div>`;
    return;
  }

  cont.innerHTML = pkConfig.lados.map(l => pkRenderLadoCard(l)).join('');
}

function pkRenderLadoCard(lado) {
  const occ     = pkOcupacion[lado.id] || {};
  const dentro  = (occ.carros||0) + (occ.motos||0) + (occ.bicicletas||0);
  const ocupados = occ.ocupados !== undefined ? occ.ocupados : ((occ.carros||0) + (occ.motos||0));

  // Badge de modo
  const modeBadge = !lado.habilitado
    ? `<span class="pk-mode-badge off"><i class="bi bi-slash-circle"></i> Deshabilitado</span>`
    : lado.modo === 'controlado'
      ? `<span class="pk-mode-badge controlado"><i class="bi bi-ui-checks-grid"></i> Controlado</span>`
      : `<span class="pk-mode-badge libre"><i class="bi bi-wind"></i> Espacio libre</span>`;

  // Tipos permitidos
  const tiposPills = TIPOS_DISPONIBLES.map(t => {
    const activo = lado.tipos?.includes(t);
    return `<span class="pk-tipo-pill ${activo ? '' : 'off'}">
      <i class="bi ${TIPO_ICONS[t]}"></i> ${t}
    </span>`;
  }).join('');

  // Barra de ocupación (solo si es controlado y habilitado)
  let barraHtml = '';
  if (lado.habilitado && lado.modo === 'controlado' && lado.capacidad) {
    const pct = Math.min(100, Math.round(ocupados / lado.capacidad * 100));
    const barColor = pct >= 90 ? '#ef5350' : pct >= 70 ? '#ffa726' : '#2FA440';
    barraHtml = `
      <div style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;">
          <span>Ocupación</span>
          <span style="font-weight:600;color:#fff;">${ocupados}/${lado.capacidad} (${pct}%)</span>
        </div>
        <div class="pk-cupo-bar-wrap">
          <div class="pk-cupo-bar-fill" style="width:${pct}%;background:${barColor};"></div>
        </div>
      </div>`;
  }

  // Stats chips
  const chipsBici  = `<div class="pk-stat-chip"><i class="bi bi-bicycle pk-chip-icon" style="color:#ffd54f;"></i><div><div class="pk-chip-num">${occ.bicicletas||0}</div><div class="pk-chip-lbl">Bicis dentro</div></div></div>`;
  const chipsMoto  = `<div class="pk-stat-chip"><i class="bi bi-scooter pk-chip-icon" style="color:#81c784;"></i><div><div class="pk-chip-num">${occ.motos||0}</div><div class="pk-chip-lbl">Motos dentro</div></div></div>`;
  const chipsCarros = `<div class="pk-stat-chip"><i class="bi bi-car-front-fill pk-chip-icon" style="color:#90caf9;"></i><div><div class="pk-chip-num">${occ.carros||0}</div><div class="pk-chip-lbl">Carros dentro</div></div></div>`;

  let capacidadChip = '';
  if (lado.modo === 'controlado' && lado.capacidad) {
    const disp = Math.max(0, lado.capacidad - ocupados);
    capacidadChip = `<div class="pk-stat-chip"><i class="bi bi-p-circle-fill pk-chip-icon" style="color:#ce93d8;"></i><div><div class="pk-chip-num">${disp}</div><div class="pk-chip-lbl">Disponibles</div></div></div>`;
  }

  // Botón toggle habilitar/deshabilitar
  const toggleBtn = lado.habilitado
    ? `<button class="pk-btn amber" onclick="pkToggleLado('${lado.id}')"><i class="bi bi-toggle2-off"></i> Deshabilitar</button>`
    : `<button class="pk-btn green" onclick="pkToggleLado('${lado.id}')"><i class="bi bi-toggle2-on"></i> Habilitar</button>`;

  return `
    <div class="pk-lado-card ${lado.habilitado ? '' : 'disabled'}" id="pk-card-${lado.id}">
      <div class="pk-lado-header">
        <div class="pk-lado-avatar ${lado.habilitado ? '' : 'disabled'}">
          <i class="bi bi-p-circle-fill" style="font-size:20px;color:#fff;"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="pk-lado-nombre">${lado.nombre}</div>
          <div class="pk-lado-meta">
            ${modeBadge}
            ${lado.modo === 'controlado' && lado.capacidad
              ? `<span><i class="bi bi-grid-fill"></i> ${lado.capacidad} espacios</span>`
              : '<span><i class="bi bi-infinity"></i> Sin límite de cupos</span>'}
            <span><i class="bi bi-people-fill"></i> ${dentro} dentro ahora</span>
          </div>
        </div>
        <div class="pk-lado-actions">
          <button class="pk-btn" onclick="pkEditarLado('${lado.id}')"><i class="bi bi-pencil-fill"></i> Editar</button>
          ${toggleBtn}
          <button class="pk-btn red" onclick="pkEliminarLado('${lado.id}', '${lado.nombre.replace(/'/g,"\\'")}')"><i class="bi bi-trash3-fill"></i></button>
        </div>
      </div>

      <div style="border-top:0.5px solid rgba(255,255,255,0.07);padding-top:14px;">
        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:8px;">Tipos de vehículo permitidos</div>
        <div class="pk-tipos-pills">${tiposPills}</div>
      </div>

      ${barraHtml}

      <div class="pk-stat-row" style="margin-top:14px;">
        ${capacidadChip}${chipsCarros}${chipsMoto}${chipsBici}
      </div>
    </div>`;
}

// ─── Toggle habilitar/deshabilitar ───────────────────────────────────
function pkToggleLado(ladoId) {
  const lado = pkConfig?.lados.find(l => l.id === ladoId);
  if (!lado) return;
  const accion = lado.habilitado ? 'deshabilitar' : 'habilitar';
  openSAModal({
    icon: lado.habilitado ? '⛔' : '✅',
    title: `${accion.charAt(0).toUpperCase() + accion.slice(1)} "${lado.nombre}"`,
    desc: `¿Confirmas que deseas <strong>${accion}</strong> el lado <strong>${lado.nombre}</strong>?
           ${lado.habilitado ? '<br><small style="color:rgba(255,255,255,0.4);">Los usuarios no podrán registrar entradas en este lado mientras esté deshabilitado.</small>' : ''}`,
    btnClass: lado.habilitado ? 'warn' : 'ok',
    btnLabel: accion.charAt(0).toUpperCase() + accion.slice(1),
    onConfirm: () => {
      lado.habilitado = !lado.habilitado;
      pkSave(pkConfig);
      pkRenderLados();
      showToast(`Lado "${lado.nombre}" ${lado.habilitado ? 'habilitado' : 'deshabilitado'}`, 'success');
    },
  });
}

// ─── Eliminar lado ────────────────────────────────────────────────────
function pkEliminarLado(ladoId, nombre) {
  openSAModal({
    icon: '🗑️',
    title: `Eliminar "${nombre}"`,
    desc: `¿Estás seguro de eliminar el lado <strong>${nombre}</strong>? Esta acción no se puede deshacer.<br>
           <small style="color:rgba(244,67,54,0.7);">Los registros de uso históricos no se verán afectados.</small>`,
    btnClass: 'danger',
    btnLabel: 'Eliminar',
    onConfirm: () => {
      pkConfig.lados = pkConfig.lados.filter(l => l.id !== ladoId);
      pkSave(pkConfig);
      pkRenderLados();
      showToast(`Lado "${nombre}" eliminado`, 'info');
    },
  });
}

// ─── Modal editar/agregar lado ────────────────────────────────────────
function pkAgregarLado() {
  if (!pkConfig) { showToast('Selecciona un centro primero.', 'error'); return; }
  pkModalCtx = { mode: 'add' };
  pkOpenModal({
    icon: '➕',
    title: 'Agregar nuevo lado',
    nombre: '',
    modo: 'controlado',
    capacidad: '',
    habilitado: true,
    tipos: ['Bicicleta', 'Moto', 'Carro'],
  });
}

function pkEditarLado(ladoId) {
  const lado = pkConfig?.lados.find(l => l.id === ladoId);
  if (!lado) return;
  pkModalCtx = { mode: 'edit', ladoId };
  pkOpenModal({ ...lado, icon: '✏️', title: `Editar "${lado.nombre}"` });
}

function pkOpenModal({ icon, title, nombre, modo, capacidad, habilitado, tipos }) {
  document.getElementById('pk-modal-icon').textContent  = icon;
  document.getElementById('pk-modal-title').textContent = title;

  const tiposChecks = TIPOS_DISPONIBLES.map(t => `
    <label class="pk-check-item">
      <input type="checkbox" value="${t}" ${tipos?.includes(t) ? 'checked' : ''}
             onchange="pkUpdateTiposAll()">
      <i class="bi ${TIPO_ICONS[t]}"></i> ${t}
    </label>`).join('');

  document.getElementById('pk-modal-body').innerHTML = `
    <div class="pk-form-group">
      <label><i class="bi bi-tag-fill"></i> Nombre del lado</label>
      <input type="text" id="pk-f-nombre" placeholder="Ej: Lado A, Parqueadero 1..." value="${nombre || ''}">
    </div>

    <div class="pk-form-group">
      <label><i class="bi bi-sliders"></i> Modo de control</label>
      <select id="pk-f-modo" onchange="pkToggleCapacidadField()">
        <option value="controlado" ${modo === 'controlado' ? 'selected' : ''}>Controlado — con límite de cupos</option>
        <option value="libre"      ${modo === 'libre'      ? 'selected' : ''}>Espacio libre — sin límite de cupos</option>
      </select>
    </div>

    <div class="pk-form-group" id="pk-f-cap-wrap" style="${modo === 'libre' ? 'display:none;' : ''}">
      <label><i class="bi bi-grid-fill"></i> Capacidad total de espacios</label>
      <input type="number" id="pk-f-capacidad" placeholder="Ej: 21" min="1" max="500" value="${capacidad || ''}">
    </div>

    <div class="pk-form-group">
      <label><i class="bi bi-car-front-fill"></i> Tipos de vehículo permitidos</label>
      <div class="pk-check-group" id="pk-tipos-check">${tiposChecks}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;">
        <i class="bi bi-info-circle"></i> Las bicicletas nunca consumen cupo aunque estén en modo controlado
      </div>
    </div>

    <div class="pk-form-group">
      <label><i class="bi bi-toggle2-on"></i> Estado inicial</label>
      <select id="pk-f-habilitado">
        <option value="1" ${habilitado !== false ? 'selected' : ''}>Habilitado</option>
        <option value="0" ${habilitado === false  ? 'selected' : ''}>Deshabilitado</option>
      </select>
    </div>`;

  document.getElementById('pk-modal').classList.add('visible');
}

function pkToggleCapacidadField() {
  const modo = document.getElementById('pk-f-modo')?.value;
  const wrap = document.getElementById('pk-f-cap-wrap');
  if (wrap) wrap.style.display = modo === 'libre' ? 'none' : '';
}

function pkUpdateTiposAll() { /* solo mantiene estado via checkboxes, no necesita acción */ }

function pkCloseModal() {
  document.getElementById('pk-modal').classList.remove('visible');
  pkModalCtx = null;
}

function pkModalSave() {
  const nombre    = document.getElementById('pk-f-nombre')?.value.trim();
  const modo      = document.getElementById('pk-f-modo')?.value;
  const capVal    = document.getElementById('pk-f-capacidad')?.value;
  const habVal    = document.getElementById('pk-f-habilitado')?.value;
  const capacidad = modo === 'controlado' ? (parseInt(capVal) || null) : null;
  const habilitado = habVal !== '0';

  if (!nombre) { showToast('El nombre del lado es obligatorio.', 'error'); return; }
  if (modo === 'controlado' && (!capacidad || capacidad < 1)) {
    showToast('Ingresa una capacidad válida para el modo controlado.', 'error'); return;
  }

  // Tipos seleccionados
  const checks = document.querySelectorAll('#pk-tipos-check input[type=checkbox]:checked');
  const tipos  = Array.from(checks).map(c => c.value);
  if (!tipos.length) { showToast('Selecciona al menos un tipo de vehículo.', 'error'); return; }

  if (pkModalCtx?.mode === 'add') {
    const newId = 'lado-' + Date.now();
    pkConfig.lados.push({ id: newId, nombre, habilitado, modo, capacidad, tipos });
    showToast(`Lado "${nombre}" agregado`, 'success');
  } else if (pkModalCtx?.mode === 'edit') {
    const idx = pkConfig.lados.findIndex(l => l.id === pkModalCtx.ladoId);
    if (idx >= 0) {
      pkConfig.lados[idx] = { ...pkConfig.lados[idx], nombre, habilitado, modo, capacidad, tipos };
      showToast(`Lado "${nombre}" actualizado`, 'success');
    }
  }

  pkSave(pkConfig);
  pkCloseModal();
  pkRenderLados();
}

// ─── Override showSection para incluir parqueadero ────────────────────
// El showSection original ya está overrideado más arriba; solo añadimos el caso.
const _showSectionPrevRef = showSection;
showSection = function(name, btn) {
  _showSectionPrevRef(name, btn);
  if (name === 'parqueadero') pkInit();
};