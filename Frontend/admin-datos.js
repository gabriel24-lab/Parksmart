// admin-datos.js — Carga de datos, gráficas e historial
'use strict';

  setInterval(() => cargarStatsAvanzados(), 60000);

  async function cargarStatsAvanzados() {
    try {
      const res = await apiFetch('/parqueadero/stats-hoy');
      if (!res) return;
      const data = await res.json();
      if (data.ok && data.data) {
        const d = data.data;

        // ── Entradas y salidas del día completo (historial real) ────────
        const elEnt = document.getElementById('stat-entradas');
        const elSal = document.getElementById('stat-salidas');
        if (elEnt) elEnt.textContent = d.entradas_hoy ?? 0;
        if (elSal) elSal.textContent = d.salidas_hoy  ?? 0;

        // ── Gráficas del panel global ───────────────────────────────────
        renderChartHora(d.por_hora   || []);
        renderChartSemana(d.por_semana || []);
      }
    } catch(e) { console.warn('Error stats:', e); }
  }

  async function cargarCatalogos() {
    try {
      const [resR, resC] = await Promise.all([
        apiFetch('/catalogos/regiones'),
        apiFetch('/catalogos/centros')
      ]);
      const [dR, dC] = await Promise.all([resR.json(), resC.json()]);
      if (dR.ok) regionesSENA = dR.data;
      if (dC.ok) centrosSENA  = dC.data;

      // Llenar selects de regiones
      const fillReg = (id) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecciona una región</option>';
        regionesSENA.forEach(r => {
          const o = document.createElement('option'); o.value = r.id_region; o.textContent = r.nombre; sel.appendChild(o);
        });
      };
      fillReg('reg-region');
      fillReg('a-region');
    } catch(e) { console.warn('Error catálogos:', e); }
  }

  async function cargarPerfilAdmin() {
    try {
      const res = await apiFetch('/usuarios/perfil');
      const data = await res.json();
      if (data.ok && data.data) {
        const u = data.data;
        document.getElementById('a-nombre').value = u.nombre_completo || '';
        document.getElementById('a-tipo-id').value = u.tipo_id || '';
        document.getElementById('a-num-id').value = u.numero_id || '';
        if (u.id_region) {
          document.getElementById('a-region').value = u.id_region;
          filterCentrosAdmin();
          document.getElementById('a-centro').value = u.id_centro || '';
        }
        updateAdminAvatar(u.nombre_completo || 'Admin');
      }
    } catch(e) { console.warn('Error perfil admin:', e); }
  }

  async function cargarCuposDesdeAPI() {
    try {
      // Llamamos en paralelo: cupos (capacidad total) + ocupacion-rol (desglose por tipo)
      const [resOcup, resRol] = await Promise.all([
        apiFetch('/parqueadero/cupos'),
        apiFetch('/parqueadero/ocupacion-rol')
      ]);
      if (!resOcup || !resRol) return;
      const [dataOcup, dataRol] = await Promise.all([resOcup.json(), resRol.json()]);

      // 1. Capacidad y ocupados totales por lado (para la barra de progreso y lado A controlado)
      if (dataOcup.ok && dataOcup.data) {
        dataOcup.data.forEach(row => {
          const ladoNombre = (row.lado || row.Lado || '').toString().toUpperCase().trim();
          const ocup = parseInt(row.ocupados ?? row.Ocupados ?? 0);
          const esA = ladoNombre.includes('A') && !ladoNombre.includes('B');
          if (esA) {
            ladoA.ocupados = ocup;
            ladoA.total    = parseInt(row.capacidad ?? row.Capacidad ?? 21);
            const elDisp = document.getElementById('dA-disponibles');
            const elOcup = document.getElementById('dA-ocupados');
            const disp   = parseInt(row.disponibles ?? row.Disponibles ?? 0);
            if (elDisp) elDisp.textContent = disp;
            if (elOcup) elOcup.textContent = ocup;
          }
        });
      }

      // 2. Desglose REAL por tipo de vehículo
      if (dataRol.ok && dataRol.data) {
        const d = dataRol.data;
        // Lado A (controlado): sincronizar ocupados y capacidad
        if (d.lado_a) {
          ladoA.ocupados = Number(d.lado_a.ocupados  || ladoA.ocupados);
          ladoA.total    = Number(d.lado_a.capacidad || ladoA.total);
          const elCarros = document.getElementById('dA-carros');
          const elBicis  = document.getElementById('dA-bicis');
          const elOcup   = document.getElementById('dA-ocupados');
          if (elCarros) elCarros.textContent = d.lado_a.carros     || 0;
          if (elBicis)  elBicis.textContent  = d.lado_a.bicicletas || 0;
          if (elOcup)   elOcup.textContent   = d.lado_a.ocupados   || 0;
        }
        // Lado B (abierto): sincronizar conteo por tipo
        if (d.lado_b) {
          ladoB.carros.dentro = Number(d.lado_b.carros     || 0);
          ladoB.motos.dentro  = Number(d.lado_b.motos      || 0);
          ladoB.bicis.dentro  = Number(d.lado_b.bicicletas || 0);
        }
      }

      updateCuposUI();
    } catch (err) {
      console.warn('No se pudo cargar ocupación desde la API:', err);
    }
  }

  async function cargarUsuariosDesdeAPI() {
    try {
      const res = await apiFetch('/parqueadero/usuarios-admin');
      if (!res) return;
      const data = await res.json();
      if (data.ok && data.data) {
        usuarios = data.data.map(u => ({
          id: u.qr_code || 'SIN-QR',
          id_usuario: u.id_usuario,
          nombre: u.nombre_completo || 'Sin nombre',
          tipoId: u.tipo_id,
          numId: u.numero_id,
          email: u.email || null,
          rol: u.rol || 'aprendiz',
          centro: u.centro_nombre || 'No asignado',
          vehiculos: u.vehiculos || [],
          estado: u.dentro ? 'Dentro' : 'Fuera',
          foto: u.foto_perfil || null
        }));
        renderUsersTable(usuarios);
      }
    } catch(e) { console.warn('Error usuarios:', e); }
  }

  async function cargarRecientesDesdeAPI() {
    // Mostrar estado de carga inmediatamente
    const tbM = document.getElementById('recent-tbody');
    const tbA = document.getElementById('recent-tbody-A');
    const tbB = document.getElementById('recent-tbody-B');
    const loadingRow = (cols) =>
      `<tr><td colspan="${cols}" style="text-align:center;padding:20px;opacity:0.5">
        <i class="bi bi-hourglass-split"></i> Cargando...
       </td></tr>`;
    if (tbM) tbM.innerHTML = loadingRow(6);
    if (tbA) tbA.innerHTML = loadingRow(4);
    if (tbB) tbB.innerHTML = loadingRow(4);

    const emptyRow  = (cols) => `<tr><td colspan="${cols}" style="text-align:center;padding:20px;opacity:0.5">Sin actividad reciente hoy</td></tr>`;
    const errorRow  = (cols, msg) => `<tr><td colspan="${cols}" style="text-align:center;padding:16px;color:#ef9a9a;font-size:13px;">${msg}</td></tr>`;

    try {
      const res = await apiFetch('/parqueadero/reciente');

      // Si apiFetch retorna undefined (token expirado sin refresh), mostrar aviso
      if (!res) {
        if (tbM) tbM.innerHTML = errorRow(6, 'Sesión expirada. Recarga la página.');
        if (tbA) tbA.innerHTML = errorRow(4, 'Sesión expirada.');
        if (tbB) tbB.innerHTML = errorRow(4, 'Sesión expirada.');
        return;
      }

      // Si el servidor devuelve un error HTTP
      if (!res.ok) {
        const errMsg = `Error del servidor (${res.status})`;
        console.error('cargarRecientesDesdeAPI HTTP error:', res.status, res.statusText);
        if (tbM) tbM.innerHTML = errorRow(6, errMsg);
        if (tbA) tbA.innerHTML = errorRow(4, errMsg);
        if (tbB) tbB.innerHTML = errorRow(4, errMsg);
        return;
      }

      const data = await res.json();

      // Si la API retorna ok:false
      if (!data.ok) {
        console.error('cargarRecientesDesdeAPI API error:', data.message);
        if (tbM) tbM.innerHTML = errorRow(6, data.message || 'Error al cargar actividad');
        if (tbA) tbA.innerHTML = errorRow(4, data.message || 'Error');
        if (tbB) tbB.innerHTML = errorRow(4, data.message || 'Error');
        return;
      }

      const registros = data.data || [];

      if (!registros.length) {
        if (tbM) tbM.innerHTML = emptyRow(6);
        if (tbA) tbA.innerHTML = emptyRow(4);
        if (tbB) tbB.innerHTML = emptyRow(4);
        return;
      }

      let htmlMain = '', htmlA = '', htmlB = '';

      registros.forEach(r => {
        try {
          const nombre  = r.nombre_completo || 'Sin nombre';
          const qr      = r.qr_code || '---';
          const tipoRaw = (r.tipo_vehiculo || '').toString();
          const veh     = tipoRaw ? tipoRaw.charAt(0).toUpperCase() + tipoRaw.slice(1) : 'Vehículo';
          const tipo    = r.estado === 'activo' ? 'in' : 'out';
          const evTag   = tipo === 'in' ? 'Entrada' : 'Salida';

          const tLow = tipoRaw.toLowerCase();
          const vtag = (tLow === 'auto' || tLow === 'carro' || tLow === 'furgoneta') ? 'car'
                     : (tLow === 'motocicleta' || tLow === 'moto') ? 'moto'
                     : 'bike';

          const fechaAcc = fechaColombia(r.fecha_accion);
          const hoyStr  = hoyColombia();
          const diaReg  = fechaAcc ? fechaAcc.toLocaleDateString('en-CA', { timeZone:'America/Bogota' }) : null;
          const esHoy   = diaReg === hoyStr;
          const time = fechaAcc
            ? (esHoy
                ? fechaAcc.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota' })
                : fechaAcc.toLocaleDateString('es-CO', { day:'2-digit', month:'short', timeZone:'America/Bogota' })
                  + ' ' + fechaAcc.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota' }))
            : '--:--';

          // Extraer solo 'A' o 'B' del nombre ("Lado A" → "A", "LADO B" → "B")
          const ladoMatch = (r.lado || '').toString().match(/\b([AB])\b/i);
          const ladoStr   = ladoMatch ? ladoMatch[1].toUpperCase() : 'A';
          const badgeLado = `<span class="side-badge ${ladoStr.toLowerCase()}">${ladoStr}</span>`;

          htmlMain += `<tr>
            <td>${nombre}</td>
            <td><code>${qr}</code></td>
            <td><span class="vtag ${vtag}">${veh}</span></td>
            <td>${time}</td>
            <td>${badgeLado}</td>
            <td><span class="event-badge ${tipo}">${evTag}</span></td>
          </tr>`;

          if (ladoStr === 'A') {
            htmlA += `<tr>
              <td>${nombre}</td>
              <td><span class="vtag ${vtag}">${veh}</span></td>
              <td>${time}</td>
              <td><span class="event-badge ${tipo}">${evTag}</span></td>
            </tr>`;
          } else if (ladoStr === 'B') {
            htmlB += `<tr>
              <td>${nombre}</td>
              <td><span class="vtag ${vtag}">${veh}</span></td>
              <td>${time}</td>
              <td><span class="event-badge ${tipo}">${evTag}</span></td>
            </tr>`;
          }
        } catch (rowErr) {
          console.error('Error procesando fila de actividad:', rowErr, r);
        }
      });

      if (tbM) tbM.innerHTML = htmlMain || emptyRow(6);
      if (tbA) tbA.innerHTML = htmlA    || emptyRow(4);
      if (tbB) tbB.innerHTML = htmlB    || emptyRow(4);

    } catch (e) {
      console.error('cargarRecientesDesdeAPI excepción:', e);
      if (tbM) tbM.innerHTML = errorRow(6, 'Error de conexión con el servidor');
      if (tbA) tbA.innerHTML = errorRow(4, 'Error de conexión');
      if (tbB) tbB.innerHTML = errorRow(4, 'Error de conexión');
    }
  }

  function startClock() {
    function tick() {
      const now = new Date();
      document.getElementById('live-time').textContent =
        now.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'America/Bogota' });
    }
    tick(); setInterval(tick, 1000);
  }

  // ══ CHARTS ══
  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color:'rgba(255,255,255,0.7)', font:{ family:'Inter', size:11 } } } },
      scales: {
        x: { ticks:{ color:'rgba(255,255,255,0.55)', font:{family:'Inter',size:10} }, grid:{ color:'rgba(255,255,255,0.07)' } },
        y: { beginAtZero:true, ticks:{ color:'rgba(255,255,255,0.55)', font:{family:'Inter',size:10}, precision:0 }, grid:{ color:'rgba(255,255,255,0.07)' } }
      }
    };
  }

  // Muestra un mensaje "sin datos" dentro del wrapper cuando no hay registros
  function noDataMsg(wrapperId, msg) {
    const wrap = document.getElementById(wrapperId)?.parentElement;
    if (!wrap) return;
    wrap.innerHTML = `<div class="chart-no-data"><i class="bi bi-bar-chart-line"></i>${msg || 'Sin actividad registrada'}</div>`;
  }

  let chartHoraInst = null;
  function renderChartHora(porHora = []) {
    if (chartHoraInst) { chartHoraInst.destroy(); chartHoraInst = null; }
    const wrap = document.querySelector('#chartHora')?.parentElement;
    const total = porHora.reduce((s, r) => s + Number(r.entradas||0) + Number(r.salidas||0), 0);
    if (!total) {
      if (wrap) wrap.innerHTML = '<div class="chart-no-data"><i class="bi bi-bar-chart-line"></i>Sin actividad registrada hoy</div>';
      return;
    }
    if (wrap && !wrap.querySelector('canvas')) {
      wrap.innerHTML = '<canvas id="chartHora"></canvas>';
    }
    const ctx = document.getElementById('chartHora');
    if (!ctx) return;
    const labels = [], entradas = [], salidas = [];
    for (let h = 6; h <= 18; h++) {
      labels.push(h > 12 ? (h-12)+'PM' : (h===12 ? '12PM' : h+'AM'));
      const obj = porHora.find(x => Number(x.hora) === h) || {};
      entradas.push(Number(obj.entradas||0));
      salidas.push(Number(obj.salidas||0));
    }
    chartHoraInst = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [
        { label:'Entradas', data:entradas, backgroundColor:'rgba(66,165,245,0.75)', borderRadius:3 },
        { label:'Salidas',  data:salidas,  backgroundColor:'rgba(239,83,80,0.65)',  borderRadius:3 }
      ]},
      options: chartDefaults()
    });
  }

  let chartSemanaInst = null;
  function renderChartSemana(porSemana = []) {
    if (chartSemanaInst) { chartSemanaInst.destroy(); chartSemanaInst = null; }
    const wrap = document.querySelector('#chartSemana')?.parentElement;
    const total = porSemana.reduce((s, r) => s + Number(r.ingresos||0), 0);
    if (!total) {
      if (wrap) wrap.innerHTML = '<div class="chart-no-data"><i class="bi bi-graph-up"></i>Sin ingresos en los últimos 7 días</div>';
      return;
    }
    if (wrap && !wrap.querySelector('canvas')) {
      wrap.innerHTML = '<canvas id="chartSemana"></canvas>';
    }
    const ctx = document.getElementById('chartSemana');
    if (!ctx) return;

    // Generar las fechas reales de los últimos 7 días en hora Colombia
    const diasNombres = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const labels   = [];
    const ingresos = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() - i);
      const dow   = fecha.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
      const dia   = fecha.getDate();
      labels.push(`${diasNombres[dow]} ${dia}`);
      const o = porSemana.find(x => Number(x.dia_semana) === dow);
      ingresos.push(o ? Number(o.ingresos) : 0);
    }

    chartSemanaInst = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label:'Ingresos', data:ingresos,
        borderColor:'#42a5f5', backgroundColor:'rgba(66,165,245,0.12)',
        fill:true, tension:0.4, pointBackgroundColor:'#42a5f5', pointRadius:4
      }]},
      options: chartDefaults()
    });
  }

  // ══ TABLA USUARIOS ══
  function renderUsersTable(list) {
    const tbody = document.getElementById('users-tbody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:rgba(255,255,255,0.4);padding:24px">Sin resultados</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(u => {
      const dentro = u.estado === 'Dentro';
      // Normalizar: la BD devuelve 'Auto', 'Motocicleta', 'Bicicleta', 'Furgoneta'
      const tieneCarro = u.vehiculos && u.vehiculos.some(v => {
        const t = (v.tipo || '').toLowerCase();
        return t === 'auto' || t === 'carro' || t === 'furgoneta';
      });
      
      // Columna de entrada/salida rápida
      let entradaSalidaCol;
      if (dentro) {
        entradaSalidaCol = `
          <div class="inline-action-wrap">
            <button class="inline-action-btn exit-btn" title="Registrar salida" onclick="toggleUserStatus('${u.id}')">
              <i class="bi bi-arrow-up-circle-fill"></i> Salida
            </button>
          </div>`;
      } else {
        // Ambos lados disponibles para todos los roles
        const ladoOpts = '<option value="1">Lado A — Espacios controlados</option><option value="2">Lado B — Espacio abierto</option>';

        let vehiculoOpts = '';
        if (u.vehiculos && u.vehiculos.length > 1) {
             vehiculoOpts = `<select class="inline-select" id="veh-sel-${u.id}" style="max-width:80px; margin-right:4px;">` + 
                            u.vehiculos.map(v => `<option value="${v.id_vehiculo}">${v.tipo}</option>`).join('') +
                            `</select>`;
        } else if (u.vehiculos && u.vehiculos.length === 1) {
             vehiculoOpts = `<input type="hidden" id="veh-sel-${u.id}" value="${u.vehiculos[0].id_vehiculo}">`;
        }

        entradaSalidaCol = `
          <div class="inline-action-wrap" style="flex-wrap:wrap; gap:4px;">
            ${vehiculoOpts}
            <select class="inline-select" id="lado-sel-${u.id}">
              ${ladoOpts}
            </select>
            <button class="inline-action-btn entry-btn" title="Registrar entrada" onclick="toggleUserStatusWithLado('${u.id}')">
              <i class="bi bi-arrow-down-circle-fill"></i> Entrada
            </button>
          </div>`;
      }

      // Vehículos HTML
      const vehiculosHtml = (u.vehiculos && u.vehiculos.length > 0)
        ? u.vehiculos.map(v => {
            const t = (v.tipo || '').toLowerCase();
            const c = (t === 'auto' || t === 'carro' || t === 'furgoneta') ? 'car'
                    : (t === 'motocicleta' || t === 'moto') ? 'moto'
                    : 'bike';
            return `<span class="vtag ${c}">${v.tipo}</span>`;
          }).join('<div style="margin-top:4px;"></div>')
        : `<span style="opacity:0.5;font-size:12px;">Sin Vehículo</span>`;

      return `
      <tr>
        <td><div class="user-cell"><div class="mini-av">${u.foto ? `<img src="${u.foto}" alt="${u.nombre}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : u.nombre.split(' ').map(w=>w[0]).slice(0,2).join('')}</div><button class="user-name-link" onclick="showUserCard('${u.id}')" title="Ver carnet de ${u.nombre}">${u.nombre}</button></div></td>
        <td><code class="id-code">${u.id}</code></td>
        <td>${u.tipoId} · ${u.numId}</td>
        <td class="centro-td">${u.centro}</td>
        <td>${vehiculosHtml}</td>
        <td><span class="event-badge ${dentro?'in':'out'}">${u.estado}</span></td>
        <td>${entradaSalidaCol}</td>
        <td>
          <div class="action-btns">
            <button class="act-btn view" title="Ver QR" onclick="showUserQR('${u.id}','${u.nombre}')"><i class="bi bi-qr-code"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function filterUsers() {
    const q = document.getElementById('user-search').value.toLowerCase();
    let vf = document.getElementById('filter-vehicle').value;
    if (vf) vf = vf.toLowerCase();
    
    const filtered = usuarios.filter(u => {
      const matchQ = u.nombre.toLowerCase().includes(q) || u.id.toLowerCase().includes(q) || u.numId.includes(q);
      const matchV = !vf || (u.vehiculos && u.vehiculos.some(v => v.tipo.toLowerCase() === vf));
      return matchQ && matchV;
    });
    renderUsersTable(filtered);
  }

  async function toggleUserStatus(id) {
    const u = usuarios.find(x => x.id === id);
    if (!u) return;
    try {
      const res = await apiFetch('/parqueadero/admin-salida', {
        method: 'POST',
        body: JSON.stringify({ id_usuario: u.id_usuario }),
      });
      const data = await res.json();
      if (!data.ok) { showToast(data.message || 'Error al registrar salida', 'error'); return; }
    } catch (e) { showToast('Error de conexión', 'error'); return; }
    
    await cargarCuposDesdeAPI();
    await cargarUsuariosDesdeAPI();
    await cargarRecientesDesdeAPI();
    showToast(`${u.nombre} → Salida registrada ✓`);
  }

  async function toggleUserStatusWithLado(id) {
    const u = usuarios.find(x => x.id === id);
    if (!u || u.estado === 'Dentro') return;
    const ladoSel = document.getElementById('lado-sel-' + id);
    const lado = ladoSel ? parseInt(ladoSel.value) : 1;
    const ladoNombre = lado === 1 ? 'A' : 'B';
    
    let id_vehiculo = null;
    const vehSel = document.getElementById('veh-sel-' + id);
    if (vehSel) {
      id_vehiculo = parseInt(vehSel.value);
    } else if (u.vehiculos && u.vehiculos.length > 0) {
      id_vehiculo = u.vehiculos[0].id_vehiculo;
    }
    
    if (!id_vehiculo) {
      showToast('Este usuario no tiene vehículos registrados.', 'error');
      return;
    }

    try {
      const res = await apiFetch('/parqueadero/admin-entrada', {
        method: 'POST',
        body: JSON.stringify({ id_usuario: u.id_usuario, id_vehiculo, id_lado: lado }),
      });
      const data = await res.json();
      if (!data.ok) { showToast(data.message || 'Error al registrar entrada', 'error'); return; }
    } catch (e) { showToast('Error de conexión', 'error'); return; }

    await cargarCuposDesdeAPI();
    await cargarUsuariosDesdeAPI();
    await cargarRecientesDesdeAPI();
    showToast(`${u.nombre} → Entrada registrada (Lado ${ladoNombre}) ✓`);
  }

  // ── Instancias de gráficas de lados A / B (para poder destruirlas y re-renderizar)
  let _chartHoraAInst = null, _chartTipoAInst = null;
  let _chartHoraBInst = null, _chartSemanaBInst = null;

  function switchDashLado(lado, btn) {
    document.querySelectorAll('.dash-lado-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.dash-side-panel').forEach(p => p.style.display = 'none');
    const panelId = lado === 'global' ? 'dash-panel-global' : 'dash-panel-' + lado;
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = '';
    // Siempre recargar gráficas con datos frescos al cambiar de tab
    if (lado === 'A') cargarStatsLado(1);
    if (lado === 'B') cargarStatsLado(2);
  }

  async function cargarStatsLado(id_lado) {
    try {
      const res = await apiFetch(`/parqueadero/stats-lado?id_lado=${id_lado}`);
      if (!res) return;
      const data = await res.json();
      if (!data.ok || !data.data) return;
      const { por_hora, por_tipo, por_semana } = data.data;
      await new Promise(r => setTimeout(r, 60));
      if (id_lado === 1) {
        renderChartHoraA(por_hora);
        renderChartTipoA(por_tipo);
      } else {
        renderChartHoraB(por_hora);
        renderChartSemanaB(por_semana);
      }
    } catch(e) { console.warn('Error stats-lado:', e); }
  }

  function _rebuildCanvas(id) {
    const wrap = document.getElementById(id)?.parentElement;
    if (!wrap) return null;
    if (!wrap.querySelector('canvas#' + id)) {
      wrap.innerHTML = `<canvas id="${id}"></canvas>`;
    }
    return document.getElementById(id);
  }

  function renderChartHoraA(porHora = []) {
    if (_chartHoraAInst) { _chartHoraAInst.destroy(); _chartHoraAInst = null; }
    const total = porHora.reduce((s, r) => s + Number(r.entradas||0) + Number(r.salidas||0), 0);
    const wrap = document.getElementById('chartHoraA')?.parentElement;
    if (!total) {
      if (wrap) wrap.innerHTML = '<div class="chart-no-data"><i class="bi bi-bar-chart-line"></i>Sin actividad en Lado A hoy</div>';
      return;
    }
    const ctx = _rebuildCanvas('chartHoraA');
    if (!ctx) return;
    const labels = [], entradas = [], salidas = [];
    for (let h = 6; h <= 18; h++) {
      labels.push(h > 12 ? (h-12)+'PM' : (h===12 ? '12PM' : h+'AM'));
      const obj = porHora.find(x => Number(x.hora)===h) || {};
      entradas.push(Number(obj.entradas||0));
      salidas.push(Number(obj.salidas||0));
    }
    _chartHoraAInst = new Chart(ctx, { type:'bar', data:{ labels, datasets:[
      { label:'Entradas A', data:entradas, backgroundColor:'rgba(99,179,237,0.75)', borderRadius:4 },
      { label:'Salidas A',  data:salidas,  backgroundColor:'rgba(252,129,74,0.7)',  borderRadius:4 }
    ]}, options: chartDefaults() });
  }

  function renderChartTipoA(porTipo = []) {
    if (_chartTipoAInst) { _chartTipoAInst.destroy(); _chartTipoAInst = null; }
    const tipoMap = [
      { label:'Carros',     match:['auto','carro','furgoneta','automóvil'] },
      { label:'Motos',      match:['motocicleta','moto'] },
      { label:'Bicicletas', match:['bicicleta'] },
    ];
    const valores = tipoMap.map(({ match }) =>
      porTipo.filter(r => r.tipo && match.includes(r.tipo.toLowerCase())).reduce((s,r) => s+Number(r.cantidad),0)
    );
    const total = valores.reduce((s,v) => s+v, 0);
    const wrap = document.getElementById('chartTipoA')?.parentElement;
    if (!total) {
      if (wrap) wrap.innerHTML = '<div class="chart-no-data"><i class="bi bi-pie-chart"></i>Sin registros de tipos hoy</div>';
      return;
    }
    const ctx = _rebuildCanvas('chartTipoA');
    if (!ctx) return;
    const colors = ['rgba(99,179,237,0.85)','rgba(252,211,77,0.85)','rgba(72,187,120,0.85)'];
    _chartTipoAInst = new Chart(ctx, { type:'doughnut', data:{ labels:tipoMap.map(t=>t.label), datasets:[{
      data:valores, backgroundColor:colors, borderColor:'rgba(255,255,255,0.1)', borderWidth:2
    }]}, options:{
      responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{
        legend:{ labels:{ color:'rgba(255,255,255,0.7)', font:{size:12} } },
        tooltip:{ callbacks:{ label: c => ` ${c.label}: ${c.raw} (${total>0?Math.round(c.raw*100/total):0}%)` } }
      }
    }});
  }

  function renderChartHoraB(porHora = []) {
    if (_chartHoraBInst) { _chartHoraBInst.destroy(); _chartHoraBInst = null; }
    const total = porHora.reduce((s,r) => s+Number(r.entradas||0)+Number(r.salidas||0), 0);
    const wrap = document.getElementById('chartHoraB')?.parentElement;
    if (!total) {
      if (wrap) wrap.innerHTML = '<div class="chart-no-data"><i class="bi bi-bar-chart-line"></i>Sin actividad en Lado B hoy</div>';
      return;
    }
    const ctx = _rebuildCanvas('chartHoraB');
    if (!ctx) return;
    const labels = [], entradas = [], salidas = [];
    for (let h = 6; h <= 18; h++) {
      labels.push(h > 12 ? (h-12)+'PM' : (h===12 ? '12PM' : h+'AM'));
      const obj = porHora.find(x => Number(x.hora)===h) || {};
      entradas.push(Number(obj.entradas||0));
      salidas.push(Number(obj.salidas||0));
    }
    _chartHoraBInst = new Chart(ctx, { type:'bar', data:{ labels, datasets:[
      { label:'Entradas B', data:entradas, backgroundColor:'rgba(159,122,234,0.75)', borderRadius:4 },
      { label:'Salidas B',  data:salidas,  backgroundColor:'rgba(237,137,54,0.7)',   borderRadius:4 }
    ]}, options: chartDefaults() });
  }

  function renderChartSemanaB(porSemana = []) {
    if (_chartSemanaBInst) { _chartSemanaBInst.destroy(); _chartSemanaBInst = null; }
    const total = porSemana.reduce((s,r) => s+Number(r.ingresos||0), 0);
    const wrap = document.getElementById('chartSemanaB')?.parentElement;
    if (!total) {
      if (wrap) wrap.innerHTML = '<div class="chart-no-data"><i class="bi bi-graph-up"></i>Sin ingresos en los últimos 7 días (Lado B)</div>';
      return;
    }
    const ctx = _rebuildCanvas('chartSemanaB');
    if (!ctx) return;
    // Fechas reales de los últimos 7 días en hora Colombia
    const diasNombres = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const labels   = [];
    const ingresos = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() - i);
      const dow = fecha.getDay();
      const dia = fecha.getDate();
      labels.push(`${diasNombres[dow]} ${dia}`);
      const o = porSemana.find(x => Number(x.dia_semana) === dow);
      ingresos.push(o ? Number(o.ingresos) : 0);
    }
    _chartSemanaBInst = new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'Ingresos Lado B', data:ingresos,
      borderColor:'rgba(159,122,234,0.9)', backgroundColor:'rgba(159,122,234,0.15)',
      tension:0.4, fill:true, pointBackgroundColor:'rgba(159,122,234,1)', pointRadius:4
    }]}, options: chartDefaults() });
  }

  // ══ CARNET FLOTANTE DE USUARIO ══
  function showUserCard(qrId) {
    const u = usuarios.find(x => x.id === qrId);
    if (!u) return;

    // ── Foto o iniciales ──
    const photoWrap = document.getElementById('uc-photo-wrap');
    const initials  = u.nombre.split(' ').filter(Boolean).map(w => w[0]).slice(0,2).join('').toUpperCase();
    if (u.foto) {
      photoWrap.innerHTML = `<img src="${u.foto}" alt="Foto de ${u.nombre}">`;
    } else {
      photoWrap.innerHTML = `<span class="uc-initials">${initials}</span>`;
    }

    // ── Nombre ──
    document.getElementById('uc-user-name').textContent = u.nombre;

    // ── Rol ──
    const rolLabels = { aprendiz:'Aprendiz', funcionario:'Funcionario', instructor:'Instructor', admin:'Administrador' };
    const rolIcons  = { aprendiz:'bi-mortarboard-fill', funcionario:'bi-briefcase-fill', instructor:'bi-book-fill', admin:'bi-shield-fill' };
    const rol = u.rol || 'aprendiz';
    document.getElementById('uc-role-badge').innerHTML = `<i class="bi ${rolIcons[rol] || 'bi-person-fill'}"></i> ${rolLabels[rol] || rol}`;

    // ── Identificación (últimos 4 visibles) ──
    const numStr = String(u.numId || '');
    const maskedNum = numStr.length > 4
      ? `<span class="uc-masked">${'• '.repeat(numStr.length - 4).trim()}</span> ${numStr.slice(-4)}`
      : numStr;
    document.getElementById('uc-tipo-id').textContent = u.tipoId || 'ID';
    document.getElementById('uc-num-id').innerHTML = maskedNum;

    // ── Email enmascarado ──
    const emailEl = document.getElementById('uc-email');
    if (u.email) {
      const atIdx = u.email.indexOf('@');
      const local  = atIdx > -1 ? u.email.slice(0, atIdx) : u.email;
      const domain = atIdx > -1 ? u.email.slice(atIdx) : '';
      const masked = local.length > 2
        ? `${local[0]}<span class="uc-masked">${'•'.repeat(Math.min(local.length - 2, 5))}</span>${local.slice(-1)}${domain}`
        : u.email;
      emailEl.innerHTML = masked;
    } else {
      emailEl.textContent = 'Sin correo';
    }

    // ── Centro ──
    const centroEl = document.getElementById('uc-centro');
    const centro = u.centro || 'No asignado';
    centroEl.textContent = centro.length > 28 ? centro.slice(0, 26) + '…' : centro;
    centroEl.title = centro;

    // ── Vehículos ──
    const vehContent = document.getElementById('uc-vehicle-content');
    if (u.vehiculos && u.vehiculos.length > 0) {
      const v = u.vehiculos[0];
      const t = (v.tipo || '').toLowerCase();
      const vIcon = (t === 'auto' || t === 'carro' || t === 'furgoneta') ? 'bi-car-front-fill'
                  : (t === 'motocicleta' || t === 'moto') ? 'bi-scooter'
                  : 'bi-bicycle';
      const detail = [v.color, v.descripcion].filter(Boolean).join(' · ');
      const placa  = v.placa ? v.placa.toUpperCase() : (v.modelo || '');
      vehContent.innerHTML = `
        <div class="uc-vtag"><i class="bi ${vIcon}"></i> ${v.tipo}${placa ? ' · ' + placa : ''}</div>
        ${detail ? `<span class="uc-placa">${detail}</span>` : ''}
        ${u.vehiculos.length > 1 ? `<div style="font-size:10px;color:rgba(255,255,255,0.28);margin-top:5px;">+${u.vehiculos.length - 1} vehículo(s) más</div>` : ''}
      `;
    } else {
      vehContent.innerHTML = '<span style="opacity:.45;font-size:12px;">Sin vehículo</span>';
    }

    // ── Estado ──
    const dentro = u.estado === 'Dentro';
    const statusBadge = document.getElementById('uc-status-badge');
    const statusDot   = document.getElementById('uc-status-dot');
    statusBadge.className = `uc-status-badge ${dentro ? 'st-in' : 'st-out'}`;
    statusDot.className   = `uc-status-dot ${dentro ? 'dot-in' : 'dot-out'}`;
    document.getElementById('uc-status-text').textContent = dentro ? 'Dentro' : 'Fuera';
    document.getElementById('uc-last-seen').textContent   = dentro ? 'Actualmente en el parqueadero' : '';

    // ── ID Code ──
    const shortId = qrId.length > 20 ? qrId.slice(0,8) + '…' + qrId.slice(-4) : qrId;
    document.getElementById('uc-id-code').textContent = shortId;

    // ── Botón Ver QR conecta al modal existente ──
    document.getElementById('uc-qr-btn').onclick = () => { closeUserCard(); showUserQR(qrId, u.nombre); };

    // ── Mostrar overlay ──
    document.getElementById('user-card-overlay').classList.add('visible');
  }

  function closeUserCard() {
    document.getElementById('user-card-overlay').classList.remove('visible');
  }

  function handleUserCardOverlayClick(e) {
    if (e.target === document.getElementById('user-card-overlay')) closeUserCard();
  }

  // Cerrar con Escape (sin interferir con otros listeners)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeUserCard();
  });

  // ══ ESCÁNER QR ══
  let html5QrcodeScanner = null;
  let currentFacingMode  = 'environment';
