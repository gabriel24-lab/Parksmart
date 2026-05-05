// dashboard-parqueadero.js — QR, cupos, historial y parqueadero
'use strict';


    // ════════ GUARD: si no está logueado, al login ════════
    if (!Auth.isLogged()) window.location.href = 'login.html';

    // ════════ ESTADO GLOBAL ════════
    let vehiculos = [];
    let deleteIndex = -1;
    let userProfile = null;

    const ROL_LABELS = { aprendiz: 'Aprendiz', funcionario: 'Funcionario', instructor: 'Instructor', admin: 'Admin' };
    const ROL_COLORS = { aprendiz: '#1565c0', funcionario: '#2e7d32', instructor: '#6a1b9a', admin: '#b71c1c' };
    const TIPO_ICONS = { bicicleta: 'bi-bicycle', carro: 'bi-car-front-fill', moto: 'bi-scooter'};
    const TIPO_LABELS = { bicicleta: 'Bicicleta', carro: 'Carro', moto: 'Moto'};

    // ════════ INIT ════════
    window.addEventListener('DOMContentLoaded', async () => {
      // Cargar datos del usuario guardados en localStorage
      const user = Auth.getUser();
      if (user) applyUserToUI(user);

      // Historial no depende del rol: carga en paralelo
      loadHistorial();

      // Perfil y vehículos primero — necesitamos el ROL antes de loadCupos
      await loadPerfil();
      await loadVehiculos();

      // Ahora sí cargamos cupos (el rol ya está disponible en localStorage)
      loadCupos();

      // Renderizar vehículos y sección de rol
      renderVehicleList();
      applyRolToVehicleSection();

      // QR — al final, cuando ya tenemos usuario y vehículos cargados
      await generateUserQR();
    });

    // ════════ GENERAR QR CON DATOS COMPLETOS ════════
    async function generateUserQR() {
      const user = Auth.getUser();
      if (!user) return;

      // Usar la variable global 'vehiculos' que ya cargó loadVehiculos()
      // Si aún está vacía (primer load), intentar cargarla
      if (!vehiculos.length) {
        try {
          const res = await apiGet('/vehiculos');
          if (res.ok) {
           const mapTipo = { 1: 'bicicleta', 2: 'moto', 3: 'carro'};
            vehiculos = res.data.map(v => ({ ...v, tipo: v.tipo || mapTipo[v.id_tipo] || '' }));
          }
        } catch (e) { }
      }

      const qrPayload = user.qr_code || user.numero_id || 'SIN-DATOS';

      // Canvas principal (panel)
      const canvas = document.getElementById('qrCanvas');
      if (canvas) {
        try {
          // Removemos la propiedad 'color' personalizada que estaba causando problemas de renderizado (se veía en blanco)
          await QRCode.toCanvas(canvas, qrPayload, {
            width: 240, margin: 2
          });
        } catch (e) { console.warn('QR error:', e); }
      }
      // Label ID
      const label = document.getElementById('qr-id-label');
      if (label) label.textContent = user.qr_code || 'SIN-QR';

      // Guardar payload globalmente para el modal fullscreen
      window._qrPayload = qrPayload;
      window._qrUserName = user.nombre_completo || '';
      window._qrCode = user.qr_code || '';
    }

    // ════════ QR PANTALLA COMPLETA ════════
    async function openQRFullscreen() {
      const modal = document.getElementById('qr-fullscreen-modal');
      if (!modal) return;

      // Nombre e ID
      const nameEl = document.getElementById('qr-fs-name');
      const idEl = document.getElementById('qr-fs-id');
      if (nameEl) nameEl.textContent = window._qrUserName || '';
      if (idEl) idEl.textContent = window._qrCode || '';

      // Renderizar QR grande
      const canvasFS = document.getElementById('qrCanvasFS');
      if (canvasFS && window._qrPayload) {
        try {
          await QRCode.toCanvas(canvasFS, window._qrPayload, {
            width: Math.min(window.innerWidth - 80, 320),
            margin: 2,
          });
        } catch (e) { console.warn('QR FS error:', e); }
      }

      modal.style.display = 'flex';
      // Solicitar pantalla completa del navegador si está disponible
      try { modal.requestFullscreen && modal.requestFullscreen(); } catch (e) { }
    }

    function closeQRFullscreen() {
      const modal = document.getElementById('qr-fullscreen-modal');
      if (modal) modal.style.display = 'none';
      try { document.exitFullscreen && document.exitFullscreen(); } catch (e) { }
    }

    // ════════ APLICAR DATOS DE USUARIO A LA UI ════════
    function applyUserToUI(user) {
      const nombre = user.nombre_completo || 'Usuario';
      const parts = nombre.trim().split(' ').filter(Boolean);
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : (parts[0]?.[0]?.toUpperCase() || 'U');

      document.getElementById('dash-name').textContent = parts[0] || 'Usuario';
      document.getElementById('topbar-av').textContent = initials;
      document.getElementById('profile-avatar-initials').textContent = initials;
      document.getElementById('profile-display-name').textContent = nombre;

      if (user.rol) {
        const badge = document.getElementById('profile-role-badge');
        badge.textContent = ROL_LABELS[user.rol] || user.rol;
        badge.style.background = (ROL_COLORS[user.rol] || '#555') + '44';
        badge.style.color = '#fff';
      }
    }

    // ════════ CUPOS (por rol) ════════
    async function loadCupos() {
      try {
        const user = Auth.getUser();
        const rol = user?.rol || '';

        const data = await apiGet('/parqueadero/ocupacion-rol');
        if (!data.ok) return;
        const d = data.data;

        // ── Tarjetas del inicio: filtradas por rol ─────────────────────
        const cardBicis = document.getElementById('card-bicis-a');
        const cardCarros = document.getElementById('card-carros-a');
        const cardMotos = document.getElementById('card-motos-a');

        if (rol === 'aprendiz') {
          // Aprendiz: solo ve bicicletas en Lado A
          if (cardBicis) { cardBicis.style.display = ''; document.getElementById('num-bicis-a').textContent = d.lado_a.bicicletas ?? 0; }
          if (cardCarros) cardCarros.style.display = 'none';
          if (cardMotos)  cardMotos.style.display = 'none';

          // Lado B para aprendices: solo muestra cuántas bicicletas hay
          // No se muestran cupos disponibles ni capacidad (son solo para carros)
          const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
          const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
          show('inicio-ladob-titulo');
          show('inicio-ladob-cards');
          hide('inicio-ladob-barra'); // la barra de ocupación es de carros, no aplica

          // Título actualizado
          const tituloB = document.getElementById('inicio-ladob-titulo');
          if (tituloB) tituloB.innerHTML = '<i class="bi bi-p-square"></i> Lado B <span style="font-size:11px;font-weight:400;opacity:.55;">(bicicletas en tiempo real)</span>';

          // Solo la tarjeta de bicicletas — sin cupos ni capacidad
          const cardsB = document.getElementById('inicio-ladob-cards');
          if (cardsB) {
            const bicisB = d.lado_b.bicicletas ?? 0;
            cardsB.innerHTML = `
              <div class="stat-card available">
                <div class="stat-icon"><i class="bi bi-bicycle"></i></div>
                <div class="stat-info">
                  <span class="stat-number">${bicisB}</span>
                  <span class="stat-label">Bicicletas adentro</span>
                </div>
                <div class="stat-badge green">Lado B</div>
              </div>`;
          }

        } else {
          if (cardBicis) cardBicis.style.display = 'none';
          if (cardCarros) { cardCarros.style.display = ''; document.getElementById('num-carros-a').textContent = d.lado_a.carros ?? 0; }
          if (cardMotos) { cardMotos.style.display = ''; document.getElementById('num-motos-a').textContent = d.lado_a.motos ?? 0; }

          // Funcionarios/instructores: asegurarse que Lado B sea visible
          const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
          show('inicio-ladob-titulo');
          show('inicio-ladob-cards');
          show('inicio-ladob-barra');
        }

        // ── Barra/tarjetas Lado B del inicio (solo para no-aprendices) ──
        const ocup = d.lado_b.ocupados ?? 0;
        const disp = d.lado_b.disponibles ?? 0;
        const pct = d.lado_b.capacidad > 0 ? Math.round(ocup * 100 / d.lado_b.capacidad) : 0;

        const elOcup = document.getElementById('num-ocup-b');
        const elDisp = document.getElementById('num-disp-b');
        const elPct = document.getElementById('badge-pct-b');
        const elBar = document.getElementById('bar-fill-b');
        const elBarPct = document.getElementById('bar-pct-b');

        if (elOcup) elOcup.textContent = ocup;
        if (elDisp) elDisp.textContent = disp;
        if (elPct) elPct.textContent = pct + '%';
        if (elBar) elBar.style.width = pct + '%';
        if (elBarPct) elBarPct.textContent = pct + '%';

        // ── Sección "Parqueadero" — Lado A completo ────────────────────
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('park-a-carros', d.lado_a.carros ?? 0);
        set('park-a-motos', d.lado_a.motos ?? 0);
        set('park-a-bicis', d.lado_a.bicicletas ?? 0);
        set('park-a-total', d.lado_a.total ?? 0);

        // ── Sección "Parqueadero" — Lado B ────────────────────────────
        set('park-b-disp', disp);
        set('park-b-ocup', ocup);
        const pb = document.getElementById('park-b-pct-badge');
        if (pb) pb.textContent = pct + '%';
        const pbBar = document.getElementById('park-b-bar');
        const pbBarPct = document.getElementById('park-b-bar-pct');
        if (pbBar) pbBar.style.width = pct + '%';
        if (pbBarPct) pbBarPct.textContent = pct + '%';

        // ── Mapa de cupos Lado B (20 espacios: fila1=10, fila2=10) ────
        renderParkBGrid(ocup, d.lado_b.capacidad ?? 21);

      } catch (e) { console.warn('loadCupos:', e); }
    }

    // Genera visualmente el mapa de cupos del Lado B
    function renderParkBGrid(ocupados, total) {
      const row1 = document.getElementById('park-b-grid-row1');
      const row2 = document.getElementById('park-b-grid-row2');
      if (!row1 || !row2) return;

      const mitad = Math.ceil(total / 2);
      const mkSlot = (num, ocupado) => {
        const div = document.createElement('div');
        div.style.cssText = `
          width:44px;height:54px;border-radius:8px;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:3px;font-size:11px;font-weight:600;
          border:1.5px solid ${ocupado ? 'rgba(239,83,80,.5)' : 'rgba(76,175,80,.4)'};
          background:${ocupado ? 'rgba(239,83,80,.18)' : 'rgba(76,175,80,.12)'};
          color:${ocupado ? '#ef9a9a' : '#a5d6a7'};cursor:default;transition:all .2s;`;
        div.innerHTML = `<i class="bi ${ocupado ? 'bi-car-front-fill' : 'bi-p-circle'}" style="font-size:16px;"></i><span>${num}</span>`;
        div.title = ocupado ? `Espacio ${num}: Ocupado` : `Espacio ${num}: Libre`;
        return div;
      };

      row1.innerHTML = '';
      row2.innerHTML = '';
      for (let i = 1; i <= total; i++) {
        const ocupado = i <= ocupados;
        const el = mkSlot(i, ocupado);
        if (i <= mitad) row1.appendChild(el);
        else row2.appendChild(el);
      }
    }

    // ════════ SWITCH TABS PARQUEADERO ════════
    function switchParkLado(lado, btn) {
      document.querySelectorAll('.dash-lado-tab').forEach(t => {
        // Solo afectar los tabs de la sección parqueadero
        if (t.id === 'park-tab-a' || t.id === 'park-tab-b') t.classList.remove('active');
      });
      if (btn) btn.classList.add('active');
      document.getElementById('park-panel-A').style.display = lado === 'A' ? '' : 'none';
      document.getElementById('park-panel-B').style.display = lado === 'B' ? '' : 'none';
    }


    // ════════ HISTORIAL (sección completa) ════════
    let histPage = 1;
    let histTodosLosRegistros = [];
