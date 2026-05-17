// admin-cupos.js — Variables globales, control de cupos y UI helpers
'use strict';

  // ══ LISTA DE USUARIOS (DINÁMICA) ══
  let usuarios = [];

  let regionesSENA = [];
  let centrosSENA  = [];

  // ══ ESTADO LADO A (espacios controlados, 21 cupos para carros) ══
  const ladoA = { total:21, ocupados:0 };

  // ══ ESTADO LADO B (conteo libre, espacio abierto) ══
  const ladoB = {
    carros: { dentro:0, entradas:0, salidas:0 },
    motos:  { dentro:0, entradas:0, salidas:0 },
    bicis:  { dentro:0, entradas:0, salidas:0 },
  };

  // Tabs Lado A / B
  function switchSide(side) {
    document.getElementById('panel-A').style.display = side==='A' ? 'block' : 'none';
    document.getElementById('panel-B').style.display = side==='B' ? 'block' : 'none';
    document.getElementById('tab-a').classList.toggle('active', side==='A');
    document.getElementById('tab-b').classList.toggle('active', side==='B');
    if (side==='A') renderAGrid();
  }

  // ── Lado A helpers (CONTROLADO) ──
  function refreshLadoA() {
    const disp = ladoA.total - ladoA.ocupados;
    const pct  = Math.round((ladoA.ocupados / ladoA.total)*100);
    const elDisp  = document.getElementById('a-disp-num');
    const elOcc   = document.getElementById('a-occ-num');
    const elTotal = document.getElementById('a-total-num');
    if (elDisp)  elDisp.textContent  = disp;
    if (elOcc)   elOcc.textContent   = ladoA.ocupados;
    if (elTotal) elTotal.textContent = ladoA.total;
    const circle = document.getElementById('a-cupo-circle');
    if (circle) circle.className = 'cupo-circle ' + (pct>=80?'danger':pct>=50?'warn':'ok');
    renderAGrid();
    // stats dashboard globales
    document.getElementById('stat-disponibles').textContent = disp;
    document.getElementById('stat-ocupados').textContent = ladoA.ocupados;
    document.getElementById('stat-pct').textContent = pct+'%';
    const bar = document.getElementById('occ-bar');
    if (bar) { bar.style.width = pct+'%'; bar.querySelector('span').textContent = pct+'%'; }
  }

  function adjustA(delta) {
    const newOcc = ladoA.ocupados + delta;
    if (newOcc < 0 || newOcc > ladoA.total) return;
    ladoA.ocupados = newOcc;
    refreshLadoA();
    showToast(delta > 0 ? 'Espacio ocupado (Lado A)' : 'Espacio liberado (Lado A)');
  }

  function setATotal() {
    const val = parseInt(document.getElementById('a-total-input').value);
    if (!val || val < 1) return;
    ladoA.total = val;
    if (ladoA.ocupados > ladoA.total) ladoA.ocupados = ladoA.total;
    refreshLadoA();
    showToast(`Total Lado A actualizado a ${val} espacios`);
  }

  function renderAGrid() {
    const half  = Math.ceil(ladoA.total / 2);
    const grid1 = document.getElementById('a-grid-row1');
    const grid2 = document.getElementById('a-grid-row2');
    if (!grid1) return;
    let h1='', h2='';
    for (let i=1; i<=ladoA.total; i++) {
      const occ = i <= ladoA.ocupados;
      const slot = `<div class="cupo-slot ${occ?'occ':'free'}" title="Espacio ${i}">${i}</div>`;
      if (i <= half) h1 += slot; else h2 += slot;
    }
    grid1.innerHTML = h1; grid2.innerHTML = h2;
  }

  // ── Lado B helpers (ABIERTO / conteo libre) ──
  function refreshLadoB() {
    const total    = ladoB.carros.dentro + ladoB.motos.dentro + ladoB.bicis.dentro;
    const totalHoy = ladoB.carros.entradas + ladoB.motos.entradas + ladoB.bicis.entradas;
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('b-carros-dentro', ladoB.carros.dentro);
    setEl('b-motos-dentro',  ladoB.motos.dentro);
    setEl('b-bicis-dentro',  ladoB.bicis.dentro);
    setEl('b-total-dentro',  total);
    setEl('b-carros-hoy-b',  ladoB.carros.entradas + ' hoy');
    setEl('b-motos-hoy-b',   ladoB.motos.entradas  + ' hoy');
    setEl('b-bicis-hoy-b',   ladoB.bicis.entradas  + ' hoy');
    setEl('b-total-hoy-b',   totalHoy + ' hoy');
    setEl('b-carros-num',  ladoB.carros.dentro);
    setEl('b-motos-num',   ladoB.motos.dentro);
    setEl('b-bicis-num',   ladoB.bicis.dentro);
    setEl('b-carros-ent',  ladoB.carros.entradas);
    setEl('b-carros-sal',  ladoB.carros.salidas);
    setEl('b-motos-ent',   ladoB.motos.entradas);
    setEl('b-motos-sal',   ladoB.motos.salidas);
    setEl('b-bicis-ent',   ladoB.bicis.entradas);
    setEl('b-bicis-sal',   ladoB.bicis.salidas);
  }

  function adjustB(tipo, delta) {
    const obj = ladoB[tipo];
    const newVal = obj.dentro + delta;
    if (newVal < 0) return;
    obj.dentro = newVal;
    if (delta > 0) obj.entradas++;
    else           obj.salidas++;
    refreshLadoB();
    showToast(delta > 0 ? `+1 ${tipo} en Lado B` : `-1 ${tipo} en Lado B`);
  }

  // Función de compatibilidad para QR/toggle (actualiza conteos según vehículo)
  function updateCuposUI() {
    refreshLadoA();
    refreshLadoB();
    // Sync dashboard Lado A stats (controlado)
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const dispA = ladoA.total - ladoA.ocupados;
    const pctA  = Math.round((ladoA.ocupados / ladoA.total) * 100);
    setEl('dA-disponibles', dispA);
    setEl('dA-ocupados',    ladoA.ocupados);
    setEl('dA-pct',         pctA + '%');
    const barA = document.getElementById('occ-bar-A');
    if (barA) { barA.style.width = pctA + '%'; barA.querySelector('span').textContent = pctA + '%'; }
    // Sync dashboard Lado B stats (abierto)
    const totalB = ladoB.carros.dentro + ladoB.motos.dentro + ladoB.bicis.dentro;
    const totalBhoy = ladoB.carros.entradas + ladoB.motos.entradas + ladoB.bicis.entradas;
    setEl('dB-carros-dentro', ladoB.carros.dentro);
    setEl('dB-motos-dentro',  ladoB.motos.dentro);
    setEl('dB-bicis-dentro',  ladoB.bicis.dentro);
    setEl('dB-total-dentro',  totalB);
    setEl('dB-carros-hoy',    ladoB.carros.entradas + ' hoy');
    setEl('dB-motos-hoy',     ladoB.motos.entradas  + ' hoy');
    setEl('dB-bicis-hoy',     ladoB.bicis.entradas  + ' hoy');
    setEl('dB-total-hoy',     totalBhoy + ' hoy');
  }

  // ══ INIT ══
  window.addEventListener('DOMContentLoaded', async () => {
    // ── Guard de rol: solo admin, guardia y superadmin pueden acceder ──
    const _u = Auth.getUser();
    if (!_u || !['admin', 'guardia', 'superadmin'].includes(_u.rol)) {
      Auth.clear();
      window.location.href = 'login.html';
      return;
    }

    startClock();
    
    // Render placeholders
    refreshLadoA();
    refreshLadoB();

    // Hacer limpieza de tablas
    const rts = ['recent-tbody', 'recent-tbody-A', 'recent-tbody-B'];
    rts.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    
    // Cargar catálogos primero (necesarios para formularios)
    await cargarCatalogos();

    // Cargar todos los datos en paralelo — mucho más rápido que en serie
    await Promise.all([
      cargarCuposDesdeAPI(),
      cargarUsuariosDesdeAPI(),
      cargarRecientesDesdeAPI(),
      cargarStatsAvanzados(),
      cargarPerfilAdmin(),
    ]);
    
    // Auto-refresh cada 60s en paralelo
    setInterval(() => Promise.all([
      cargarCuposDesdeAPI(),
      cargarRecientesDesdeAPI(),
      cargarUsuariosDesdeAPI(),
    ]), 60000);
  });
