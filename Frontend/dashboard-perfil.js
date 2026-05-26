// dashboard-perfil.js — Perfil, vehículos, utilidades e inicialización
'use strict';

  // ════════ HELPER: FORMATEO DE DURACIÓN ════════
  function formatDuracion(minutos) {
    if (minutos == null) return null;
    const totalMin = Math.round(Number(minutos));
    if (totalMin <= 0) return '0 min';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  }

    async function loadHistorial(page = 1) {
      histPage = page;
      try {
        // Una sola llamada para todo: mini-tabla del dashboard y sección historial
        const data = await apiGet(`/parqueadero/historial?page=1&limit=200`);
        if (!data.ok) return;
        // Normalizar duracion_min a número (PostgreSQL puede devolverlo como string)
        histTodosLosRegistros = (data.data || []).map(r => ({
          ...r,
          duracion_min: r.duracion_min != null ? Number(r.duracion_min) : null,
        }));
        calcularResumen(histTodosLosRegistros);
        aplicarFiltros();

        // Mini-tabla del dashboard: los 4 más recientes del mismo resultado
        const tbody = document.getElementById('dash-history-tbody');
        if (!tbody) return;
        const ultimos = histTodosLosRegistros.slice(0, 4);
        if (!ultimos.length) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.5;padding:20px;">
            <i class="bi bi-inbox" style="display:block;font-size:22px;margin-bottom:6px;"></i>
            Sin registros aún
          </td></tr>`;
          return;
        }
        tbody.innerHTML = ultimos.map(r => {
          const entrada = new Date(r.fecha_entrada).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
          const salida  = r.fecha_salida
            ? new Date(r.fecha_salida).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
            : '—';
          const dur = formatDuracion(r.duracion_min) ?? '—';
          const badge = r.estado === 'completado'
            ? `<span class="badge-status done">Completado</span>`
            : `<span class="badge-status active" style="animation:pulse 1.5s infinite;">En curso</span>`;
          return `<tr>
            <td>${entrada}</td>
            <td>${r.tipo_vehiculo} · ${r.identificador}</td>
            <td>${salida}</td>
            <td>${dur}</td>
            <td>${badge}</td>
          </tr>`;
        }).join('');
      } catch (e) { console.warn('loadHistorial:', e); }
    }

    function calcularResumen(registros) {
      const total     = registros.length;
      const activos   = registros.filter(r => r.estado !== 'completado').length;
      const completados = registros.filter(r => r.duracion_min != null);
      const promMin   = completados.length
        ? Math.round(completados.reduce((s, r) => s + Number(r.duracion_min), 0) / completados.length)
        : 0;
      const promH = Math.floor(promMin / 60);
      const promM = Math.round(promMin % 60);
      const elTotal = document.getElementById('hist-total');
      const elProm  = document.getElementById('hist-promedio');
      const elAct   = document.getElementById('hist-activos');
      if (elTotal) elTotal.textContent = total;
      if (elProm)  elProm.textContent  = promH > 0 ? `${promH}h ${promM}m` : `${promM}m`;
      if (elAct)   elAct.textContent   = activos;
    }

    function aplicarFiltros() {
      const ini = document.getElementById('hist-fecha-ini')?.value;
      const fin = document.getElementById('hist-fecha-fin')?.value;
      const tipo = document.getElementById('hist-tipo')?.value;
      const estado = document.getElementById('hist-estado')?.value;

      let filtrados = [...histTodosLosRegistros];
      if (ini) filtrados = filtrados.filter(r => new Date(r.fecha_entrada) >= new Date(ini));
      if (fin) filtrados = filtrados.filter(r => new Date(r.fecha_entrada) <= new Date(fin + 'T23:59:59'));
      // Normalizar tipos: BD devuelve 'Auto','Motocicleta','Bicicleta','Furgoneta'
      const tipoGroups = {
        'auto':       ['auto','carro','furgoneta','automóvil'],
        'motocicleta':['motocicleta','moto'],
        'bicicleta':  ['bicicleta'],
      };
      if (tipo) filtrados = filtrados.filter(r => {
        const t = (r.tipo_vehiculo || '').toLowerCase();
        return (tipoGroups[tipo] || [tipo]).includes(t);
      });
      if (estado) filtrados = filtrados.filter(r => estado === 'activo' ? r.estado !== 'completado' : r.estado === estado);

      renderTablaHistorial(filtrados);
    }

    function limpiarFiltros() {
      const ids = ['hist-fecha-ini', 'hist-fecha-fin', 'hist-tipo', 'hist-estado'];
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      aplicarFiltros();
    }

    function renderTablaHistorial(registros) {
      const LIMIT = 10;
      const totalPags = Math.max(1, Math.ceil(registros.length / LIMIT));
      if (histPage > totalPags) histPage = 1;
      const inicio = (histPage - 1) * LIMIT;
      const pagina = registros.slice(inicio, inicio + LIMIT);

      const tbody = document.getElementById('hist-tbody');
      if (!tbody) return;

      const label = document.getElementById('hist-count-label');
      if (label) label.textContent = `${registros.length} registro${registros.length !== 1 ? 's' : ''}`;

      if (!registros.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;opacity:.45;">
          <i class="bi bi-search" style="font-size:28px;display:block;margin-bottom:10px;"></i>
          No se encontraron registros con esos filtros</td></tr>`;
        renderPaginacion(0, 1);
        return;
      }

      tbody.innerHTML = pagina.map((r, i) => {
        const num = inicio + i + 1;
        const entrada = new Date(r.fecha_entrada).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
        const salida = r.fecha_salida ? new Date(r.fecha_salida).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }) : '—';
        const duracion = formatDuracion(r.duracion_min) ?? '—';

        const tLow = (r.tipo_vehiculo || '').toLowerCase();
        const tipoIcon = (tLow === 'auto' || tLow === 'carro' || tLow === 'furgoneta') ? 'bi-car-front-fill'
          : (tLow === 'motocicleta' || tLow === 'moto') ? 'bi-scooter'
            : 'bi-bicycle';

        const badge = r.estado === 'completado'
          ? `<span class="badge-status done"><i class="bi bi-check-circle" style="margin-right:3px;"></i>Completado</span>`
          : `<span class="badge-status active"><i class="bi bi-circle-fill" style="font-size:7px;margin-right:4px;"></i>En curso</span>`;

        return `<tr style="cursor:pointer;" onclick="verDetalle(${JSON.stringify(r).replace(/"/g, '&quot;')})">
          <td style="color:rgba(255,255,255,0.35);font-size:12px;">${num}</td>
          <td>${entrada}</td>
          <td><i class="bi ${tipoIcon}" style="color:var(--brand-color);margin-right:5px;"></i>${r.tipo_vehiculo} · <strong>${r.identificador}</strong>${r.color ? ` <span style="font-size:11px;opacity:.6;">· ${r.color}</span>` : ''}</td>
          <td><i class="bi bi-geo-alt" style="color:var(--brand-color);margin-right:3px;"></i>${r.lado || '—'}</td>
          <td>${salida}</td>
          <td>${duracion}</td>
          <td>${badge}</td>
        </tr>`;
      }).join('');

      renderPaginacion(registros.length, totalPags);

      const info = document.getElementById('hist-page-info');
      if (info) info.textContent = `Página ${histPage} de ${totalPags} · ${registros.length} registros`;
    }

    function renderPaginacion(total, totalPags) {
      const cont = document.getElementById('hist-page-btns');
      if (!cont) return;
      cont.innerHTML = '';

      if (totalPags <= 1) return;

      const mkBtn = (label, page, disabled, active) => {
        const b = document.createElement('button');
        b.innerHTML = label;
        b.style.cssText = `padding:6px 12px;border-radius:8px;border:1.5px solid rgba(255,255,255,${active ? '0.4' : '0.15'});
          background:${active ? 'var(--brand-color)' : 'rgba(255,255,255,0.06)'};
          color:${disabled ? 'rgba(255,255,255,0.25)' : '#fff'};
          font-family:'Inter',sans-serif;font-size:13px;font-weight:${active ? '600' : '400'};
          cursor:${disabled ? 'default' : 'pointer'};`;
        if (!disabled) b.onclick = () => { histPage = page; aplicarFiltros(); };
        return b;
      };

      cont.appendChild(mkBtn('<i class="bi bi-chevron-left"></i>', histPage - 1, histPage === 1, false));
      for (let p = 1; p <= totalPags; p++) {
        if (totalPags > 7 && p > 2 && p < totalPags - 1 && Math.abs(p - histPage) > 1) {
          if (p === 3 || p === totalPags - 2) { const d = document.createElement('span'); d.textContent = '…'; d.style.cssText = 'padding:0 4px;color:rgba(255,255,255,0.3);'; cont.appendChild(d); }
          continue;
        }
        cont.appendChild(mkBtn(p, p, false, p === histPage));
      }
      cont.appendChild(mkBtn('<i class="bi bi-chevron-right"></i>', histPage + 1, histPage === totalPags, false));
    }

    function verDetalle(r) {
      const panel = document.getElementById('hist-detail-panel');
      const body = document.getElementById('hist-detail-body');
      if (!panel || !body) return;

      const entrada = new Date(r.fecha_entrada).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });
      const salida = r.fecha_salida ? new Date(r.fecha_salida).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }) : 'Aún en el parqueadero';
      const duracion = formatDuracion(r.duracion_min) ?? 'En progreso';

      const campo = (icon, label, val) => `
        <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px 16px;">
          <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-bottom:6px;display:flex;align-items:center;gap:5px;">
            <i class="bi ${icon}" style="color:var(--brand-color);"></i>${label}
          </div>
          <div style="font-size:14px;font-weight:500;">${val}</div>
        </div>`;

      body.innerHTML =
        campo('bi-hash', 'ID registro', `#${r.id_registro}`) +
        campo('bi-car-front-fill', 'Vehículo', `${r.tipo_vehiculo} · ${r.identificador}`) +
        campo('bi-palette2', 'Color', r.color || '—') +
        campo('bi-geo-alt-fill', 'Lado', r.lado || '—') +
        campo('bi-box-arrow-in-right', 'Entrada', entrada) +
        campo('bi-box-arrow-right', 'Salida', salida) +
        campo('bi-stopwatch-fill', 'Duración', duracion) +
        campo('bi-check2-circle', 'Estado', r.estado === 'completado' ? 'Completado' : 'En curso');

      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function exportarHistorial() {
      if (!histTodosLosRegistros.length) { showToast('No hay registros para exportar', 'error'); return; }

      const VERDE  = '#1a7a2e';
      const VERDE2 = '#2FA440';
      const FILA_PAR = '#f0f7f2';

      const tipoLabel = {
        'auto': 'Carro / Auto', 'car': 'Carro / Auto', 'carro': 'Carro / Auto',
        'motocicleta': 'Motocicleta', 'moto': 'Motocicleta',
        'bicicleta': 'Bicicleta', 'bicycle': 'Bicicleta',
        'furgoneta': 'Furgoneta',
      };

      const rows = histTodosLosRegistros.map(r => {
        const fe  = new Date(r.fecha_entrada);
        const fs  = r.fecha_salida ? new Date(r.fecha_salida) : null;
        const tipo = tipoLabel[(r.tipo_vehiculo || '').toLowerCase()] || r.tipo_vehiculo || '—';
        const est  = r.estado === 'completado' ? 'Completado' : 'En curso';
        return [
          fe.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }),
          fe.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }),
          tipo,
          r.identificador || '—',
          r.color         || '—',
          r.lado          || '—',
          fs ? fs.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : '—',
          fs ? fs.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '—',
          r.duracion_min != null ? formatDuracion(r.duracion_min) : '—',
          est,
        ];
      });

      const cols   = ['Fecha entrada', 'Hora entrada', 'Tipo de vehículo', 'Placa / Modelo', 'Color', 'Lado', 'Fecha salida', 'Hora salida', 'Duración', 'Estado'];
      const anchos = ['90pt', '85pt', '110pt', '100pt', '75pt', '55pt', '85pt', '85pt', '80pt', '85pt'];

      const filasHTML = rows.map((r, i) => {
        const bg = i % 2 === 0 ? '#ffffff' : FILA_PAR;
        const celdas = r.map((v, ci) => {
          let extra = '';
          if (ci === 9) {
            extra = v === 'Completado'
              ? 'color:#1a7a2e;font-weight:600;'
              : 'color:#b45309;font-weight:600;';
          }
          return `<td style="background:${bg};padding:7pt 10pt;font-size:10pt;color:#1a1a1a;border:0.5pt solid #d4e8da;${extra}">${v}</td>`;
        }).join('');
        return `<tr>${celdas}</tr>`;
      }).join('');

      const fecha = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });

      const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
    <x:ExcelWorksheet><x:Name>Mi Historial</x:Name>
    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>body { font-family: Calibri, Arial, sans-serif; } table { border-collapse: collapse; width: 100%; }</style>
</head>
<body>
<table>
  <tr>
    <td colspan="10" style="background:${VERDE};color:#ffffff;font-size:16pt;font-weight:700;padding:12pt 16pt;letter-spacing:0.5pt;">
      🅿 Parksmart — Mi Historial de Parqueadero
    </td>
  </tr>
  <tr>
    <td colspan="5" style="background:#e8f5ec;color:#1a4d27;font-size:10pt;padding:5pt 10pt;border-bottom:1pt solid #c3dfc9;">
      📅 Exportado: <b>${fecha}</b>
    </td>
    <td colspan="5" style="background:#e8f5ec;color:#1a4d27;font-size:10pt;padding:5pt 10pt;border-bottom:1pt solid #c3dfc9;text-align:right;">
      Total registros: <b>${rows.length}</b>
    </td>
  </tr>
  <tr><td colspan="10" style="height:6pt;"></td></tr>
  <tr>
    ${cols.map((c, i) => `<td style="background:${VERDE2};color:#ffffff;font-size:10pt;font-weight:700;padding:8pt 10pt;width:${anchos[i]};border:0.5pt solid #1a7a2e;text-align:center;letter-spacing:0.3pt;">${c}</td>`).join('')}
  </tr>
  ${filasHTML}
  <tr><td colspan="10" style="height:8pt;"></td></tr>
  <tr>
    <td colspan="10" style="color:#888888;font-size:8pt;padding:4pt 10pt;border-top:0.5pt solid #d4e8da;font-style:italic;">
      Generado por Parksmart el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
    </td>
  </tr>
</table>
</body></html>`;

      const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Parksmart_MiHistorial_${new Date().toISOString().slice(0, 10)}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Excel exportado ✓', 'success');
    }

    // ════════ PERFIL ════════
    async function loadPerfil() {
      try {
        const data = await apiGet('/usuarios/perfil');
        if (!data.ok) return;
        userProfile = data.data;

        // Rellenar campos del formulario
        setValue('p-nombre', data.data.nombre_completo);
        setValue('p-email', data.data.email);
        setValue('p-tipo-id', data.data.tipo_id);
        setValue('p-id-num', data.data.numero_id);
        // Rol: solo lectura — actualizar badge visual y campo oculto
        const rolHidden = document.getElementById('p-rol');
        if (rolHidden) rolHidden.value = data.data.rol || '';
        actualizarRolBadge(data.data.rol);

        // Primero cargar regiones para que el select tenga opciones
        await loadRegiones();

        // Luego poner la región y cargar los centros correspondientes
        if (data.data.id_region) {
          setValue('p-region', data.data.id_region);
          await loadCentros(data.data.id_region);
          setValue('p-centro', data.data.id_centro);
        }

        // Mostrar foto de perfil si existe
        const imgEl  = document.getElementById('profile-avatar-img');
        const initEl = document.getElementById('profile-avatar-initials');
        const btnQui = document.getElementById('btn-quitar-foto');
        if (data.data.foto_perfil && imgEl) {
          imgEl.src          = data.data.foto_perfil;
          imgEl.style.display = 'block';
          if (initEl) initEl.style.display = 'none';
          if (btnQui) btnQui.style.display = 'inline-block';
          const wrapYes = document.querySelector('.avatar-photo-wrap');
          if (wrapYes) wrapYes.classList.remove('no-foto');
          // Topbar avatar
          const tbAv = document.getElementById('topbar-av');
          if (tbAv) { tbAv.style.backgroundImage = `url(${data.data.foto_perfil})`; tbAv.style.backgroundSize = 'cover'; tbAv.textContent = ''; }
        } else {
          if (imgEl)  imgEl.style.display = 'none';
          if (initEl) initEl.style.display = '';
          if (btnQui) btnQui.style.display = 'none';
          const wrapNF = document.querySelector('.avatar-photo-wrap');
          if (wrapNF) wrapNF.classList.add('no-foto');
        }
        applyUserToUI(data.data);
        onRolChange();
      } catch (e) { console.warn('loadPerfil:', e); }
    }

    async function loadRegiones() {
      try {
        const data = await apiGet('/catalogos/regiones');
        if (!data.ok) return;
        const sel = document.getElementById('p-region');
        const cur = sel.value;
        sel.innerHTML = '<option value="">Selecciona una región</option>';
        data.data.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id_region; opt.textContent = r.nombre;
          sel.appendChild(opt);
        });
        if (cur) sel.value = cur;
      } catch (e) { }
    }

    async function loadCentros(idRegion) {
      try {
        const data = await apiGet(`/catalogos/centros?region=${idRegion}`);
        if (!data.ok) return;
        const sel = document.getElementById('p-centro');
        sel.innerHTML = '<option value="">Selecciona un centro</option>';
        data.data.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id_centro; opt.textContent = c.nombre;
          sel.appendChild(opt);
        });
      } catch (e) { }
    }

    function filterCentros() {
      const region = document.getElementById('p-region').value;
      if (region) loadCentros(region);
    }

    function setValue(id, val) {
      const el = document.getElementById(id);
      if (el && val != null) el.value = val;
    }

    function liveUpdateHeader() {
      const nombre = document.getElementById('p-nombre').value.trim();
      const parts = nombre.split(' ').filter(Boolean);
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : (parts[0]?.[0]?.toUpperCase() || 'U');
      document.getElementById('profile-avatar-initials').textContent = initials;
      document.getElementById('profile-display-name').textContent = nombre || 'Usuario';
      document.getElementById('dash-name').textContent = parts[0] || 'Usuario';
      document.getElementById('topbar-av').textContent = initials;
    }

    // Actualiza el badge visual del rol en el formulario de perfil
    function actualizarRolBadge(rol) {
      const dot  = document.getElementById('p-rol-badge-dot');
      const text = document.getElementById('p-rol-badge-text');
      if (!dot || !text) return;
      const colores = { aprendiz: '#1565c0', funcionario: '#2e7d32', instructor: '#6a1b9a', admin: '#2FA440' };
      const labels  = { aprendiz: 'Aprendiz', funcionario: 'Funcionario', instructor: 'Instructor', admin: 'Operario' };
      const color = colores[rol] || '#555';
      dot.style.background  = color;
      text.style.color      = '#e6edf3';
      text.textContent      = labels[rol] || rol || 'Sin rol asignado';
      // Tintado sutil del fondo
      const badge = document.getElementById('p-rol-badge');
      if (badge) badge.style.borderColor = color + '55';
    }

    function onRolChange() {
      const rol = document.getElementById('p-rol').value;
      const box = document.getElementById('rol-info-box');
      const badge = document.getElementById('profile-role-badge');
      if (!rol) { box.style.display = 'none'; if(badge) badge.textContent = 'Sin rol asignado'; return; }
      if (badge) {
        badge.textContent = ROL_LABELS[rol];
        badge.style.background = ROL_COLORS[rol] + '44';
        badge.style.color = '#fff';
      }
    }

    async function saveProfile() {
      const saveBtn = document.querySelector('#section-perfil .btn-save');
      if (saveBtn && saveBtn.disabled) return;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Guardando...'; }
      const nombre = document.getElementById('p-nombre').value.trim();
      const email = document.getElementById('p-email').value.trim();
      const tipo_id = document.getElementById('p-tipo-id').value;
      const num_id = document.getElementById('p-id-num').value.trim();
      const centro = document.getElementById('p-centro').value;
      const rol = document.getElementById('p-rol').value;

      if (!nombre) { showToast('Ingresa tu nombre completo.', 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Guardar cambios'; } return; }
      if (!tipo_id) { showToast('Selecciona tu tipo de identificación.', 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Guardar cambios'; } return; }
      if (!num_id) { showToast('Ingresa tu número de identificación.', 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Guardar cambios'; } return; }
      // El rol no se valida aquí — es de solo lectura, asignado por el sistema o el admin
      if (!centro) { showToast('Debes seleccionar tu centro de formación.', 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Guardar cambios'; } return; }

      try {
        const data = await apiPut('/usuarios/perfil', {
          nombre_completo: nombre,
          email: email,
          tipo_id,
          numero_id: num_id,
          id_centro: centro || null,
          // rol se omite: solo el admin puede cambiarlo desde el panel de administración
        });
        if (!data.ok) { showToast(data.message || 'Error al guardar.', 'error'); return; }

        // Mapear "saveProfile();" por error recursivo anterior (eliminado por loop)
        // en lugar de eso llamaremos a loadPerfil() si fuera necesario, pero la actualizamos acá mismo

        // Actualizar user en localStorage
        const user = Auth.getUser();
        Auth.save({
          access_token: Auth.getToken(),
          refresh_token: Auth.getRefreshToken(),
          user: { ...user, nombre_completo: nombre, email: email, tipo_id, numero_id: num_id, id_centro: centro || null },
        });

        liveUpdateHeader();
        applyRolToVehicleSection();
        showToast('¡Perfil guardado!', 'success');
      } catch { showToast('Error de conexión.', 'error'); }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Guardar cambios'; }
    }

    async function changePassword() {
      const cpBtn = document.querySelector('#section-seguridad .btn-save') || document.querySelector('[onclick*="changePassword"]');
      if (cpBtn && cpBtn.disabled) return;
      if (cpBtn) cpBtn.disabled = true;
      const actual   = document.getElementById('sec-pass-act').value;
      const nuevo    = document.getElementById('sec-pass-new').value;
      const confirm  = document.getElementById('sec-pass-confirm').value;
      const hint     = document.getElementById('sec-pass-match-hint');

      if (!actual || !nuevo || !confirm) { showToast('Completa los tres campos de contraseña.', 'error'); return; }
      if (nuevo.length < 8) { showToast('La nueva contraseña debe tener al menos 8 caracteres.', 'error'); return; }
      if (nuevo !== confirm) {
        if (hint) { hint.style.display = 'block'; hint.style.background = 'rgba(239,83,80,.12)'; hint.style.color = '#ef9a9a'; hint.style.border = '1px solid rgba(239,83,80,.3)'; hint.textContent = '⚠ Las contraseñas no coinciden.'; }
        showToast('Las contraseñas nuevas no coinciden.', 'error'); return;
      }
      if (hint) hint.style.display = 'none';

      try {
        const data = await apiPut('/usuarios/cambiar-password', { password_actual: actual, password_nuevo: nuevo });
        if (!data.ok) { showToast(data.message || (data.errors && data.errors[0].msg) || 'Error al cambiar contraseña.', 'error'); return; }
        document.getElementById('sec-pass-act').value = '';
        document.getElementById('sec-pass-new').value = '';
        document.getElementById('sec-pass-confirm').value = '';
        showToast('Contraseña actualizada correctamente ✓', 'success');
      } catch { showToast('Error de conexión.', 'error'); }
      if (cpBtn) cpBtn.disabled = false;
    }

    function toggleSecPass(inputId, iconId) {
      const inp = document.getElementById(inputId);
      const ico = document.getElementById(iconId);
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      if (ico) { ico.className = inp.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash'; }
    }

    // Validación en tiempo real del campo "confirmar contraseña"
    document.addEventListener('DOMContentLoaded', () => {
      const newPass  = document.getElementById('sec-pass-new');
      const confPass = document.getElementById('sec-pass-confirm');
      const hint     = document.getElementById('sec-pass-match-hint');
      if (!newPass || !confPass || !hint) return;
      const check = () => {
        if (!confPass.value) { hint.style.display = 'none'; return; }
        const ok = newPass.value === confPass.value;
        hint.style.display = 'block';
        hint.style.background  = ok ? 'rgba(76,175,80,.12)' : 'rgba(239,83,80,.12)';
        hint.style.color       = ok ? '#a5d6a7' : '#ef9a9a';
        hint.style.border      = ok ? '1px solid rgba(76,175,80,.3)' : '1px solid rgba(239,83,80,.3)';
        hint.textContent       = ok ? '✓ Las contraseñas coinciden.' : '⚠ Las contraseñas no coinciden.';
      };
      newPass.addEventListener('input', check);
      confPass.addEventListener('input', check);
    });

    // ════════ VEHÍCULOS ════════
    async function loadVehiculos() {
      try {
        const data = await apiGet('/vehiculos');
        if (!data.ok) return;
        // Convertir id_tipo numérico a nombre
        const mapTipo = { 1: 'bicicleta', 2: 'moto', 3: 'carro' };
        vehiculos = data.data.map(v => ({
          ...v,
          tipo: v.tipo || mapTipo[v.id_tipo] || 'carro',
        }));
      } catch (e) { console.warn('loadVehiculos:', e); }
    }

    function getCurrentRol() { return document.getElementById('p-rol').value; }

    const MAX_VEHICULOS = 3;

    function applyRolToVehicleSection() {
      const rol = getCurrentRol();
      const alert = document.getElementById('vehiculo-rol-alert');
      const area = document.getElementById('vehiculo-form-area');
      const sub = document.getElementById('vehiculo-sub');
      if (!rol) { alert.style.display = 'flex'; area.style.display = 'none'; return; }
      alert.style.display = 'none'; area.style.display = 'block';
      const tabBici = document.getElementById('vtab-bicicleta');
      const tabCarro = document.getElementById('vtab-carro');
      const tabMoto = document.getElementById('vtab-moto');
      if (rol === 'aprendiz') {
        tabBici.style.display = 'inline-flex'; tabCarro.style.display = 'none'; tabMoto.style.display = 'none';
        sub.textContent = 'Aprendiz · Solo bicicletas';
        setVehicle('bicicleta', tabBici); tabBici.classList.add('active');
      } else if (rol === 'instructor' || rol === 'funcionario') {
        // Instructores y funcionarios pueden registrar bicicleta, carro y moto
        tabBici.style.display = 'inline-flex'; tabCarro.style.display = 'inline-flex'; tabMoto.style.display = 'inline-flex';
        sub.textContent = (ROL_LABELS[rol] || rol) + ' · Bicicleta, carro y moto';
        setVehicle('carro', tabCarro); tabCarro.classList.add('active');
      } else {
        tabBici.style.display = 'none'; tabCarro.style.display = 'inline-flex'; tabMoto.style.display = 'inline-flex';
        sub.textContent = (ROL_LABELS[rol] || rol) + ' · Carros y motos';
        setVehicle('carro', tabCarro); tabCarro.classList.add('active');
      }
      // Mostrar u ocultar el formulario según el límite de vehículos
      applyVehiculoLimite();
    }

    function applyVehiculoLimite() {
      const limiteBanner = document.getElementById('vehiculo-limite-banner');
      const formTabs = document.getElementById('vehiculo-tabs');
      const formsArea = document.getElementById('vehiculo-forms-area');
      const alcanzado = vehiculos.length >= MAX_VEHICULOS;
      if (limiteBanner) limiteBanner.style.display = alcanzado ? 'flex' : 'none';
      if (formTabs) formTabs.style.display = alcanzado ? 'none' : '';
      if (formsArea) formsArea.style.display = alcanzado ? 'none' : '';
    }

    function setVehicle(type, btn) {
      document.querySelectorAll('.vtab').forEach(t => t.classList.remove('active'));
      if (btn) btn.classList.add('active');
      ['carro', 'moto', 'bicicleta'].forEach(t => {
        const el = document.getElementById('form-' + t); if (el) el.style.display = 'none';
      });
      const form = document.getElementById('form-' + type); if (form) form.style.display = 'block';
    }

    function previewImage(input, previewId) {
      const preview = document.getElementById(previewId);
      if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
        reader.readAsDataURL(input.files[0]);
      }
    }

    async function saveVehicle(tipo, svBtn) {
      svBtn = svBtn || (event && event.currentTarget) || null;
      if (svBtn && svBtn.disabled) return;
      if (svBtn) { svBtn.disabled = true; svBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Guardando...'; }
      const rol = getCurrentRol();
      if (!rol) { showToast('Configura tu rol en el perfil primero.', 'error'); if (svBtn) { svBtn.disabled = false; svBtn.innerHTML = '<i class="bi bi-floppy"></i> Guardar vehículo'; } return; }

      const formData = new FormData();
      const mapTipo = { bicicleta: '1', moto: '2', carro: '3'};
      formData.append('id_tipo', mapTipo[tipo]);

      if (tipo === 'bicicleta') {
        const modelo = document.getElementById('bici-modelo').value.trim();
        const color = document.getElementById('bici-color').value.trim();
        const desc = document.getElementById('bici-desc').value.trim();
        if (!modelo || !color) { showToast('Completa modelo y color.', 'error'); return; }
        formData.append('modelo', modelo);
        formData.append('color', color);
        if (desc) formData.append('descripcion', desc);
        const foto = document.getElementById('foto-bici').files[0];
        if (foto) formData.append('foto', foto);
      } else {
        const placa = document.getElementById(tipo + '-placa').value.trim();
        const color = document.getElementById(tipo + '-color').value.trim();
        const desc = document.getElementById(tipo + '-desc').value.trim();
        if (!placa || !color) { showToast('Completa placa y color.', 'error'); return; }
        formData.append('placa', placa);
        formData.append('color', color);
        if (desc) formData.append('descripcion', desc);
        const foto = document.getElementById('foto-' + tipo)?.files[0];
        if (foto) formData.append('foto', foto);
      }

      try {
        const data = await apiPostForm('/vehiculos', formData);
        if (!data.ok) { showToast(data.message || 'Error al guardar.', 'error'); return; }

        // Recargar lista desde la API
        await loadVehiculos();
        renderVehicleList();
        clearVehicleForm(tipo);
        await generateUserQR();
        showToast('¡Vehículo registrado!', 'success');
      } catch { showToast('Error de conexión.', 'error'); }
      if (svBtn) { svBtn.disabled = false; svBtn.innerHTML = '<i class="bi bi-floppy"></i> Guardar vehículo'; }
    }

    function clearVehicleForm(tipo) {
      const ids = tipo === 'bicicleta' ? ['bici-modelo', 'bici-color', 'bici-desc'] : [tipo + '-placa', tipo + '-color', tipo + '-desc'];
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const p = document.getElementById(tipo === 'bicicleta' ? 'preview-bici' : 'preview-' + tipo);
      if (p) { p.src = ''; p.style.display = 'none'; }
      const f = document.getElementById(tipo === 'bicicleta' ? 'foto-bici' : 'foto-' + tipo);
      if (f) f.value = '';
    }

    // ════════ FOTO DE PERFIL ════════
    async function subirFotoPerfil(input) {
      if (!input.files[0]) return;
      const formData = new FormData();
      formData.append('foto', input.files[0]);
      try {
        const res  = await apiFetch('/usuarios/foto-perfil', { method: 'POST', body: formData });
        if (!res) return;
        const data = await res.json();
        if (!data.ok) { showToast(data.message || 'Error al subir foto', 'error'); return; }
        const imgEl  = document.getElementById('profile-avatar-img');
        const initEl = document.getElementById('profile-avatar-initials');
        const btnQui = document.getElementById('btn-quitar-foto');
        imgEl.src          = data.foto_url + '?t=' + Date.now();
        imgEl.style.display = 'block';
        if (initEl) initEl.style.display = 'none';
        if (btnQui) btnQui.style.display = 'inline-block';
        const wrap = document.querySelector('.avatar-photo-wrap');
        if (wrap) wrap.classList.remove('no-foto');
        const tbAv = document.getElementById('topbar-av');
        if (tbAv) { tbAv.style.backgroundImage = `url(${data.foto_url})`; tbAv.style.backgroundSize = 'cover'; tbAv.textContent = ''; }
        showToast('Foto de perfil actualizada ✓');
      } catch { showToast('No se pudo subir la foto', 'error'); }
      input.value = '';
    }

    async function quitarFotoPerfil() {
      try {
        const res  = await apiFetch('/usuarios/foto-perfil', { method: 'DELETE' });
        if (!res) return;
        const data = await res.json();
        if (!data.ok) return;
        const imgEl  = document.getElementById('profile-avatar-img');
        const initEl = document.getElementById('profile-avatar-initials');
        const btnQui = document.getElementById('btn-quitar-foto');
        if (imgEl)  { imgEl.src = ''; imgEl.style.display = 'none'; }
        if (initEl) initEl.style.display = '';
        if (btnQui) btnQui.style.display = 'none';
        const wrapQ = document.querySelector('.avatar-photo-wrap');
        if (wrapQ) wrapQ.classList.add('no-foto');
        const tbAv = document.getElementById('topbar-av');
        if (tbAv) { tbAv.style.backgroundImage = ''; tbAv.textContent = tbAv.textContent || 'U'; }
        showToast('Foto eliminada');
      } catch { showToast('Error al eliminar foto', 'error'); }
    }

    // ════════ LISTA VEHÍCULOS ════════
    function renderVehicleList() {
      // Mostrar u ocultar banner en el dashboard
      const banner = document.getElementById('banner-sin-vehiculo');
      if (banner) banner.style.display = vehiculos.length === 0 ? 'flex' : 'none';
      // Aplicar límite de 3 vehículos
      applyVehiculoLimite();

      const container = document.getElementById('perfil-vehicles-list');
      if (!vehiculos.length) {
        container.innerHTML = `<div class="pvc-empty"><i class="bi bi-exclamation-circle"></i><span>Aún no has registrado ningún vehículo. <button class="link-btn" onclick="showSection('vehiculo',null)">Regístralo aquí</button></span></div>`;
        return;
      }
      container.innerHTML = vehiculos.map((v, i) => `
    <div class="vehicle-card">
      <div class="vc-left">
        ${v.foto_url
          ? `<img class="vc-thumb" src="${v.foto_url}" alt="foto"/>`
          : `<div class="vc-icon-box tipo-${v.tipo}"><i class="bi ${TIPO_ICONS[v.tipo] || 'bi-car-front-fill'}"></i></div>`
        }
      </div>
      <div class="vc-body">
        <div class="vc-header">
          <span class="vc-type-badge tipo-${v.tipo}"><i class="bi ${TIPO_ICONS[v.tipo] || 'bi-car-front-fill'}"></i> ${TIPO_LABELS[v.tipo] || v.tipo}</span>
          <button class="vc-delete-btn" onclick="openDeleteModal(${i})"><i class="bi bi-trash3"></i> Eliminar</button>
        </div>
        <div class="vc-details">
          ${v.placa ? `<span><i class="bi bi-123"></i> <strong>Placa:</strong> ${v.placa}</span>` : ''}
          ${v.modelo ? `<span><i class="bi bi-bicycle"></i> <strong>Modelo:</strong> ${v.modelo}</span>` : ''}
          ${v.color ? `<span><i class="bi bi-palette"></i> <strong>Color:</strong> ${v.color}</span>` : ''}
          ${v.descripcion ? `<span class="vc-desc"><i class="bi bi-card-text"></i> ${v.descripcion}</span>` : ''}
        </div>
        <div class="vc-access">
          ${(v.tipo === 'moto' || v.tipo === 'bicicleta')
          ? `<i class="bi bi-info-circle-fill" style="color:#ffb74d"></i> Acceso: Solo Lado A`
          : `<i class="bi bi-check-circle-fill" style="color:#81c784"></i> Acceso: Lado A y Lado B`}
        </div>
      </div>
    </div>`).join('');
    }

    // ════════ ELIMINAR VEHÍCULO ════════
    function openDeleteModal(index) {
      deleteIndex = index;
      const v = vehiculos[index];
      const label = v.placa ? `${TIPO_LABELS[v.tipo]} · Placa ${v.placa}` : `${TIPO_LABELS[v.tipo]} · ${v.modelo || v.color}`;
      document.getElementById('delete-modal-desc').textContent = `Vas a eliminar: ${label}`;
      document.getElementById('delete-modal').style.display = 'flex';
    }
    function closeDeleteModal() { document.getElementById('delete-modal').style.display = 'none'; deleteIndex = -1; }

    async function confirmDelete() {
      if (deleteIndex < 0) return;
      const cdBtn = document.querySelector('#delete-modal .btn-save') || document.querySelector('[onclick*="confirmDelete"]');
      if (cdBtn && cdBtn.disabled) return;
      if (cdBtn) cdBtn.disabled = true;
      const v = vehiculos[deleteIndex];
      try {
        const data = await apiDelete(`/vehiculos/${v.id_vehiculo}`);
        if (!data.ok) { showToast(data.message || 'Error al eliminar.', 'error'); closeDeleteModal(); if (cdBtn) cdBtn.disabled = false; return; }
        vehiculos.splice(deleteIndex, 1);
        renderVehicleList();
        closeDeleteModal();
        showToast('Vehículo eliminado.', 'info');
      } catch { showToast('Error de conexión.', 'error'); closeDeleteModal(); }
      if (cdBtn) cdBtn.disabled = false;
    }

    // ════════ LOGOUT ════════
    async function handleLogout() {
      try {
        await apiPost('/auth/logout', { refresh_token: Auth.getRefreshToken() });
      } catch { }
      Auth.clear();
      window.location.href = 'login.html';
    }

    // ════════ NAVEGACIÓN ════════
    function showSection(name, btn) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('section-' + name).classList.add('active');
      // Activar TODOS los nav-items con esta sección (sidebar + bottom nav)
      document.querySelectorAll(`.nav-item[onclick*="'${name}'"]`).forEach(el => el.classList.add('active'));
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('overlay').classList.remove('show');
      if (name === 'vehiculo')  applyRolToVehicleSection();
      if (name === 'historial') { histPage = 1; loadHistorial(); }
    }

    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('overlay').classList.toggle('show');
    }

    function downloadQR() {
      const canvas = document.getElementById('qrCanvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'mi-qr-parqueadero.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    // ════════ TOAST ════════
    function showToast(msg, type = 'success') {
      let toast = document.getElementById('toast');
      if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast); }
      const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill' };
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `<i class="bi ${icons[type]}"></i> ${msg}`;
      toast.style.opacity = '1'; toast.style.transform = 'translateY(0)';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)'; }, 3200);
    }