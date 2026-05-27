/**
 * photo-crop.js — Editor de foto de perfil estilo Facebook
 * Parksmart v3 — Stage fijo 320px, sin medición DOM, sin timing issues
 *
 * Uso: PhotoCrop.open(file, { onConfirm: async (blob) => {} });
 */
(function (global) {
  'use strict';

  /* ─── Constantes fijas (no dependen del DOM) ─────────────── */
  var STAGE   = 320;          // px del stage cuadrado
  var RATIO   = 0.86;         // fracción del stage que ocupa el círculo
  var CIRCLE  = STAGE * RATIO / 2;  // radio del círculo en px = 137.6

  /* ─── Estado ─────────────────────────────────────────────── */
  var S = {
    scale:1, min:1, max:4,
    ox:0, oy:0,
    iw:0, ih:0,
    dragging:false, sx:0, sy:0,
    onConfirm: null,
    src: null,
  };
  var lastPinch = null;

  /* ─── CSS (una sola vez) ─────────────────────────────────── */
  if (!document.getElementById('pc-css')) {
    var css = document.createElement('style');
    css.id  = 'pc-css';
    css.textContent = [
      '#pc-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);',
        'display:flex;align-items:center;justify-content:center;',
        'backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);',
        'animation:pc-fi .17s ease;}',
      '@keyframes pc-fi{from{opacity:0}to{opacity:1}}',

      '#pc-box{background:#1b1b1d;border:1px solid rgba(255,255,255,.12);border-radius:18px;',
        'padding:22px 22px 18px;display:flex;flex-direction:column;gap:14px;',
        'width:368px;max-width:94vw;',
        'box-shadow:0 20px 60px rgba(0,0,0,.7);',
        'animation:pc-si .2s cubic-bezier(.22,.9,.36,1);}',
      '@keyframes pc-si{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',

      '#pc-head{display:flex;align-items:center;justify-content:space-between;}',
      '#pc-head h3{margin:0;font-size:15px;font-weight:600;color:#fff;font-family:inherit;}',
      '#pc-x{background:rgba(255,255,255,.07);border:none;border-radius:50%;',
        'width:30px;height:30px;display:flex;align-items:center;justify-content:center;',
        'color:rgba(255,255,255,.5);cursor:pointer;font-size:15px;flex-shrink:0;',
        'transition:background .15s,color .15s;}',
      '#pc-x:hover{background:rgba(255,255,255,.14);color:#fff;}',

      /* Stage: tamaño FIJO 320×320 definido por JS, no por CSS */
      '#pc-stage{position:relative;overflow:hidden;cursor:grab;',
        'border-radius:12px;background:#0c0c0e;touch-action:none;',
        'flex-shrink:0;align-self:center;}',
      '#pc-stage:active{cursor:grabbing;}',

      '#pc-img{position:absolute;transform-origin:center center;',
        'pointer-events:none;will-change:transform;display:block;}',

      /* Sombra que oscurece lo de fuera del círculo */
      '#pc-shade{position:absolute;inset:0;pointer-events:none;}',

      '#pc-hint{text-align:center;font-size:11px;color:rgba(255,255,255,.32);',
        'font-family:inherit;margin:0;}',

      '#pc-zrow{display:flex;align-items:center;gap:10px;}',
      '#pc-zrow i{color:rgba(255,255,255,.38);font-size:13px;flex-shrink:0;}',
      '#pc-z{flex:1;-webkit-appearance:none;appearance:none;height:4px;border-radius:4px;',
        'background:rgba(255,255,255,.13);outline:none;cursor:pointer;}',
      '#pc-z::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;',
        'border-radius:50%;background:#2FA440;cursor:pointer;',
        'box-shadow:0 0 0 3px rgba(47,164,64,.28);transition:box-shadow .15s;}',
      '#pc-z::-webkit-slider-thumb:hover{box-shadow:0 0 0 5px rgba(47,164,64,.38);}',
      '#pc-z::-moz-range-thumb{width:16px;height:16px;border:none;border-radius:50%;',
        'background:#2FA440;cursor:pointer;}',

      '#pc-foot{display:flex;gap:10px;justify-content:flex-end;}',
      '#pc-cancel{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.11);',
        'border-radius:10px;color:rgba(255,255,255,.7);font-size:13px;font-weight:500;',
        'padding:9px 20px;cursor:pointer;transition:background .15s;font-family:inherit;}',
      '#pc-cancel:hover{background:rgba(255,255,255,.12);}',
      '#pc-ok{background:#2FA440;border:none;border-radius:10px;color:#fff;',
        'font-size:13px;font-weight:600;padding:9px 22px;cursor:pointer;',
        'display:flex;align-items:center;gap:7px;font-family:inherit;',
        'transition:background .15s,transform .1s,opacity .15s;}',
      '#pc-ok:hover{background:#238033;}',
      '#pc-ok:active{transform:scale(.97);}',
      '#pc-ok[disabled]{opacity:.55;pointer-events:none;}',
    ].join('');
    document.head.appendChild(css);
  }

  /* ─── Clamp: la imagen nunca deja vacío dentro del círculo ── */
  function clamp(ox, oy, sc) {
    var hw = (S.iw * sc) / 2;
    var hh = (S.ih * sc) / 2;
    var r  = CIRCLE;
    var maxX = hw - r;  var maxY = hh - r;
    return {
      x: Math.min(maxX, Math.max(-maxX, ox)),
      y: Math.min(maxY, Math.max(-maxY, oy)),
    };
  }

  function applyTransform() {
    var img = document.getElementById('pc-img');
    if (!img) return;
    var cx = STAGE / 2 + S.ox;
    var cy = STAGE / 2 + S.oy;
    img.style.left      = cx + 'px';
    img.style.top       = cy + 'px';
    img.style.transform = 'translate(-50%,-50%) scale(' + S.scale + ')';
  }

  function setScale(v) {
    S.scale = Math.min(S.max, Math.max(S.min, v));
    var c = clamp(S.ox, S.oy, S.scale);
    S.ox = c.x; S.oy = c.y;
    var sl = document.getElementById('pc-z');
    if (sl) sl.value = S.scale;
    applyTransform();
  }

  /* ─── Mouse ──────────────────────────────────────────────── */
  function onMD(e) { e.preventDefault(); S.dragging=true; S.sx=e.clientX-S.ox; S.sy=e.clientY-S.oy; }
  function onMM(e) {
    if (!S.dragging) return;
    var c = clamp(e.clientX-S.sx, e.clientY-S.sy, S.scale);
    S.ox=c.x; S.oy=c.y; applyTransform();
  }
  function onMU() { S.dragging=false; }

  function onWheel(e) {
    e.preventDefault();
    setScale(S.scale + (e.deltaY < 0 ? 0.08 : -0.08));
  }

  /* ─── Touch ──────────────────────────────────────────────── */
  function pdist(e) {
    return Math.hypot(e.touches[1].clientX-e.touches[0].clientX,
                      e.touches[1].clientY-e.touches[0].clientY);
  }
  function onTS(e) {
    e.preventDefault();
    if (e.touches.length===1) { S.dragging=true; lastPinch=null; S.sx=e.touches[0].clientX-S.ox; S.sy=e.touches[0].clientY-S.oy; }
    else if (e.touches.length===2) { S.dragging=false; lastPinch=pdist(e); }
  }
  function onTM(e) {
    e.preventDefault();
    if (e.touches.length===1 && S.dragging) {
      var c=clamp(e.touches[0].clientX-S.sx, e.touches[0].clientY-S.sy, S.scale);
      S.ox=c.x; S.oy=c.y; applyTransform();
    } else if (e.touches.length===2 && lastPinch) {
      var d=pdist(e); setScale(S.scale*(d/lastPinch)); lastPinch=d;
    }
  }
  function onTE() { S.dragging=false; lastPinch=null; }

  /* ─── Construir modal ────────────────────────────────────── */
  function buildModal() {
    var old = document.getElementById('pc-ov');
    if (old) old.remove();

    var ov = document.createElement('div');
    ov.id  = 'pc-ov';
    ov.innerHTML =
      '<div id="pc-box">' +
        '<div id="pc-head">' +
          '<h3><i class="bi bi-person-circle" style="margin-right:7px;color:#2FA440;font-size:16px;"></i>Editar foto de perfil</h3>' +
          '<button id="pc-x" title="Cancelar"><i class="bi bi-x-lg"></i></button>' +
        '</div>' +
        '<div id="pc-stage">' +
          '<img id="pc-img" alt="" draggable="false" />' +
          '<canvas id="pc-shade"></canvas>' +
        '</div>' +
        '<p id="pc-hint"><i class="bi bi-arrows-move" style="margin-right:4px;"></i>' +
          'Arrastra para encuadrar · scroll o pellizca para zoom</p>' +
        '<div id="pc-zrow">' +
          '<i class="bi bi-zoom-out"></i>' +
          '<input type="range" id="pc-z" />' +
          '<i class="bi bi-zoom-in"></i>' +
        '</div>' +
        '<div id="pc-foot">' +
          '<button id="pc-cancel">Cancelar</button>' +
          '<button id="pc-ok"><i class="bi bi-check2"></i> Guardar foto</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    /* Fijar tamaño del stage en JS (evita cualquier problema de layout CSS) */
    var stage = document.getElementById('pc-stage');
    stage.style.width  = STAGE + 'px';
    stage.style.height = STAGE + 'px';

    return ov;
  }

  /* ─── Dibujar sombra circular con Canvas ─────────────────── */
  function drawShade() {
    var cv = document.getElementById('pc-shade');
    if (!cv) return;
    cv.width  = STAGE;
    cv.height = STAGE;
    cv.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    var ctx = cv.getContext('2d');
    // Fondo oscuro completo
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, STAGE, STAGE);
    // Recortar círculo
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(STAGE/2, STAGE/2, CIRCLE, 0, Math.PI*2);
    ctx.fill();
    // Borde verde del círculo
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(47,164,64,0.8)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(STAGE/2, STAGE/2, CIRCLE, 0, Math.PI*2);
    ctx.stroke();
  }

  /* ─── Inicializar imagen ─────────────────────────────────── */
  function initImage(src) {
    return new Promise(function(resolve, reject) {
      var img = document.getElementById('pc-img');
      img.onload = function() {
        S.iw = img.naturalWidth;
        S.ih = img.naturalHeight;

        /* Escala mínima: imagen debe cubrir el círculo por completo */
        var byW = (CIRCLE*2) / S.iw;
        var byH = (CIRCLE*2) / S.ih;
        S.min   = Math.max(byW, byH);
        S.max   = S.min * 4;
        S.scale = S.min;
        S.ox    = 0;
        S.oy    = 0;

        /* Slider */
        var sl = document.getElementById('pc-z');
        sl.min   = S.min;
        sl.max   = S.max;
        sl.step  = S.min * 0.005;
        sl.value = S.min;

        applyTransform();
        resolve();
      };
      img.onerror = function() { reject(new Error('No se pudo cargar la imagen')); };
      img.src = src;
    });
  }

  /* ─── Exportar crop JPEG 400×400 ─────────────────────────── */
  function exportCrop() {
    var OUT = 400;
    var cv  = document.createElement('canvas');
    cv.width = cv.height = OUT;
    var ctx = cv.getContext('2d');

    /* Clip circular */
    ctx.beginPath();
    ctx.arc(OUT/2, OUT/2, OUT/2, 0, Math.PI*2);
    ctx.clip();

    /* Mapeo: CIRCLE px de stage → OUT/2 px de canvas */
    var ratio = OUT / (CIRCLE * 2);
    var outW  = S.iw * S.scale * ratio;
    var outH  = S.ih * S.scale * ratio;
    var outX  = OUT/2 + S.ox * ratio - outW/2;
    var outY  = OUT/2 + S.oy * ratio - outH/2;

    var img = document.getElementById('pc-img');
    ctx.drawImage(img, outX, outY, outW, outH);

    return new Promise(function(resolve) {
      cv.toBlob(resolve, 'image/jpeg', 0.92);
    });
  }

  /* ─── Adjuntar eventos ───────────────────────────────────── */
  function attachEvents(ov) {
    var stage = document.getElementById('pc-stage');
    var sl    = document.getElementById('pc-z');
    var btnOk = document.getElementById('pc-ok');
    var btnCan= document.getElementById('pc-cancel');
    var btnX  = document.getElementById('pc-x');

    stage.addEventListener('mousedown',  onMD);
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup',   onMU);
    stage.addEventListener('wheel',      onWheel, {passive:false});
    stage.addEventListener('touchstart', onTS,    {passive:false});
    stage.addEventListener('touchmove',  onTM,    {passive:false});
    stage.addEventListener('touchend',   onTE);
    stage.addEventListener('touchcancel',onTE);
    sl.addEventListener('input', function() { setScale(parseFloat(sl.value)); });

    function close() {
      ov.style.animation = 'pc-fi .13s ease reverse';
      setTimeout(function() { ov.remove(); }, 120);
      /* Limpiar listeners globales */
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup',   onMU);
    }

    btnCan.addEventListener('click', close);
    btnX.addEventListener('click',   close);
    // Retardo: el clic que cierra el selector de archivos puede propagarse
    // al overlay recien abierto y cerrarlo inmediatamente.
    setTimeout(function() {
      ov.addEventListener('click', function(e) { if (e.target === ov) close(); });
    }, 400);

    btnOk.addEventListener('click', function() {
      btnOk.setAttribute('disabled','');
      btnOk.innerHTML = '<i class="bi bi-hourglass-split"></i> Procesando...';
      exportCrop().then(function(blob) {
        if (blob && S.onConfirm) return S.onConfirm(blob);
      }).then(function() {
        close();
      }).catch(function(err) {
        console.error('[PhotoCrop]', err);
        btnOk.removeAttribute('disabled');
        btnOk.innerHTML = '<i class="bi bi-check2"></i> Guardar foto';
      });
    });
  }

  /* ─── API pública ────────────────────────────────────────── */
  function open(file, opts) {
    if (!file) return;
    S.onConfirm = (opts && opts.onConfirm) || null;

    /* Capturar ObjectURL ANTES de tocar el DOM */
    var src = URL.createObjectURL(file);

    var ov = buildModal();
    drawShade();
    attachEvents(ov);

    initImage(src).catch(function(err) {
      console.error('[PhotoCrop] initImage falló:', err);
      ov.remove();
      URL.revokeObjectURL(src);
    });
  }

  global.PhotoCrop = { open: open };

})(window);