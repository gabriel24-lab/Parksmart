// admin-cupos.js — Variables globales, control de cupos y UI helpers
'use strict';

  // ══ LISTA DE USUARIOS (DINÁMICA) ══
  let usuarios = [];

  let regionesSENA = [];
  let centrosSENA  = [];

  // ══ ESTADO LADO A (conteo libre) ══
  const ladoA = {
    carros: { dentro:0, entradas:0, salidas:0 },
    motos:  { dentro:0, entradas:0, salidas:0 },
    bicis:  { dentro:0, entradas:0, salidas:0 },
  };

  // ══ ESTADO LADO B (espacios controlados, solo carros) ══
  const ladoB = { total:30, ocupados:0 };

  // Tabs Lado A / B
  function switchSide(side) {
    document.getElementById('panel-A').style.display = side==='A' ? 'block' : 'none';
    document.getElementById('panel-B').style.display = side==='B' ? 'block' : 'none';
    document.getElementById('tab-a').classList.toggle('active', side==='A');
    document.getElementById('tab-b').classList.toggle('active', side==='B');
    if (side==='B') renderBGrid();
  }

  // ── Lado A helpers ──
  function refreshLadoA() {
    const total = ladoA.carros.dentro + ladoA.motos.dentro + ladoA.bicis.dentro;
    const totalHoy = ladoA.carros.entradas + ladoA.motos.entradas + ladoA.bicis.entradas;
    document.getElementById('a-carros-dentro').textContent = ladoA.carros.dentro;
    document.getElementById('a-motos-dentro').textContent  = ladoA.motos.dentro;
    document.getElementById('a-bicis-dentro').textContent  = ladoA.bicis.dentro;
    document.getElementById('a-total-dentro').textContent  = total;
    document.getElementById('a-carros-hoy-b').textContent  = ladoA.carros.entradas + ' hoy';
    document.getElementById('a-motos-hoy-b').textContent   = ladoA.motos.entradas  + ' hoy';
    document.getElementById('a-bicis-hoy-b').textContent   = ladoA.bicis.entradas  + ' hoy';
    document.getElementById('a-total-hoy-b').textContent   = totalHoy + ' hoy';
    document.getElementById('a-carros-num').textContent  = ladoA.carros.dentro;
    document.getElementById('a-motos-num').textContent   = ladoA.motos.dentro;
    document.getElementById('a-bicis-num').textContent   = ladoA.bicis.dentro;
    document.getElementById('a-carros-ent').textContent  = ladoA.carros.entradas;
    document.getElementById('a-carros-sal').textContent  = ladoA.carros.salidas;
    document.getElementById('a-motos-ent').textContent   = ladoA.motos.entradas;
    document.getElementById('a-motos-sal').textContent   = ladoA.motos.salidas;
    document.getElementById('a-bicis-ent').textContent   = ladoA.bicis.entradas;
    document.getElementById('a-bicis-sal').textContent   = ladoA.bicis.salidas;
    // stats dashboard
    const totalOcup = total + ladoB.ocupados;
    const totalDisp = ladoB.total - ladoB.ocupados;
    document.getElementById('stat-disponibles').textContent = totalDisp;
    document.getElementById('stat-ocupados').textContent = totalOcup;
    const pct = Math.round((ladoB.ocupados / ladoB.total)*100);
    document.getElementById('stat-pct').textContent = pct+'%';
    const bar = document.getElementById('occ-bar');
    bar.style.width = pct+'%'; bar.querySelector('span').textContent = pct+'%';
  }

  function adjustA(tipo, delta) {
    const obj = ladoA[tipo];
    const newVal = obj.dentro + delta;
    if (newVal < 0) return;
    obj.dentro = newVal;
    if (delta > 0) obj.entradas++;
    else           obj.salidas++;
    refreshLadoA();
    showToast(delta > 0 ? `+1 ${tipo} en Lado A` : `-1 ${tipo} en Lado A`);
  }

  // ── Lado B helpers ──
  function refreshLadoB() {
    const disp = ladoB.total - ladoB.ocupados;
    const pct  = Math.round((ladoB.ocupados / ladoB.total)*100);
    document.getElementById('b-disp-num').textContent  = disp;
    document.getElementById('b-occ-num').textContent   = ladoB.ocupados;
    document.getElementById('b-total-num').textContent = ladoB.total;
    const circle = document.getElementById('b-cupo-circle');
    circle.className = 'cupo-circle ' + (pct>=80?'danger':pct>=50?'warn':'ok');
    renderBGrid();
  }

  function adjustB(delta) {
    const newOcc = ladoB.ocupados + delta;
    if (newOcc < 0 || newOcc > ladoB.total) return;
    ladoB.ocupados = newOcc;
    refreshLadoB();
    showToast(delta>0 ? 'Espacio ocupado (Lado B)' : 'Espacio liberado (Lado B)');
  }

  function setBTotal() {
    const val = parseInt(document.getElementById('b-total-input').value);
    if (!val || val < 1) return;
    ladoB.total = val;
    if (ladoB.ocupados > ladoB.total) ladoB.ocupados = ladoB.total;
    refreshLadoB();
    showToast(`Total Lado B actualizado a ${val} espacios`);
  }

  function renderBGrid() {
    const half  = Math.ceil(ladoB.total / 2);
    const grid1 = document.getElementById('b-grid-row1');
    const grid2 = document.getElementById('b-grid-row2');
    if (!grid1) return;
    let h1='', h2='';
    for (let i=1; i<=ladoB.total; i++) {
      const occ = i <= ladoB.ocupados;
      const slot = `<div class="cupo-slot ${occ?'occ':'free'}" title="Espacio ${i}">${i}</div>`;
      if (i <= half) h1 += slot; else h2 += slot;
    }
    grid1.innerHTML = h1; grid2.innerHTML = h2;
  }

  // Función de compatibilidad para QR/toggle (actualiza conteos según vehículo)
  function updateCuposUI() {
    refreshLadoA();
    refreshLadoB();
    // Sync dashboard Lado A stats
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const totalA = ladoA.carros.dentro + ladoA.motos.dentro + ladoA.bicis.dentro;
    const totalAhoy = ladoA.carros.entradas + ladoA.motos.entradas + ladoA.bicis.entradas;
    setEl('dA-carros-dentro', ladoA.carros.dentro);
    setEl('dA-motos-dentro',  ladoA.motos.dentro);
    setEl('dA-bicis-dentro',  ladoA.bicis.dentro);
    setEl('dA-total-dentro',  totalA);
    setEl('dA-carros-hoy', ladoA.carros.entradas + ' hoy');
    setEl('dA-motos-hoy',  ladoA.motos.entradas  + ' hoy');
    setEl('dA-bicis-hoy',  ladoA.bicis.entradas  + ' hoy');
    setEl('dA-total-hoy',  totalAhoy + ' hoy');
    // Sync dashboard Lado B stats
    const dispB = ladoB.total - ladoB.ocupados;
    const pctB  = Math.round((ladoB.ocupados / ladoB.total) * 100);
    setEl('dB-disponibles', dispB);
    setEl('dB-ocupados',    ladoB.ocupados);
    setEl('dB-pct',         pctB + '%');
    const barB = document.getElementById('occ-bar-B');
    if (barB) { barB.style.width = pctB + '%'; barB.querySelector('span').textContent = pctB + '%'; }
  }

  // ══ INIT ══
  window.addEventListener('DOMContentLoaded', async () => {
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
    
    // Auto-refresh cada 60 segundos
    // Auto-refresh cada 60s en paralelo
    setInterval(() => Promise.all([
      cargarCuposDesdeAPI(),
      cargarRecientesDesdeAPI(),
      cargarUsuariosDesdeAPI(),
    ]), 60000);
  });