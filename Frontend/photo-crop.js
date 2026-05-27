/**
 * photo-crop.js — Editor de foto de perfil estilo Facebook
 * Parksmart · Módulo reutilizable para todos los roles
 * v2 — Fix: layout timing, clamp robusto, errores visibles
 *
 * Uso:
 *   PhotoCrop.open(file, { onConfirm: async (blob) => { ... } });
 */

(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════
   * CSS — inyectado una sola vez
   * ═══════════════════════════════════════════════════════ */
  if (!document.getElementById('photocrop-style')) {
    const s = document.createElement('style');
    s.id = 'photocrop-style';
    s.textContent = `
      #photocrop-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.80);
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        animation: pc-fadein .18s ease;
      }
      @keyframes pc-fadein { from{opacity:0} to{opacity:1} }

      #photocrop-modal {
        background: #1a1a1c;
        border: 1px solid rgba(255,255,255,0.13);
        border-radius: 18px;
        padding: 24px 24px 20px;
        width: min(400px, 92vw);
        box-shadow: 0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05);
        animation: pc-slidein .22s cubic-bezier(.22,.9,.36,1);
        display: flex; flex-direction: column; gap: 16px;
        user-select: none; -webkit-user-select: none;
      }
      @keyframes pc-slidein {
        from{opacity:0;transform:translateY(16px) scale(.97)}
        to  {opacity:1;transform:translateY(0) scale(1)}
      }

      #photocrop-header {
        display:flex; align-items:center; justify-content:space-between;
      }
      #photocrop-header h3 {
        margin:0; font-size:15px; font-weight:600; color:#fff; font-family:inherit;
      }
      #photocrop-close {
        background:rgba(255,255,255,0.07); border:none; border-radius:50%;
        width:30px; height:30px; display:flex; align-items:center; justify-content:center;
        color:rgba(255,255,255,0.5); cursor:pointer; font-size:15px;
        transition:background .15s,color .15s; flex-shrink:0;
      }
      #photocrop-close:hover { background:rgba(255,255,255,0.14); color:#fff; }

      /* Stage cuadrado */
      #photocrop-stage {
        position:relative;
        width:100%; padding-top:100%; /* aspect-ratio 1:1 sin soporte antiguo */
        background:#0b0b0c; border-radius:12px;
        overflow:hidden; cursor:grab; touch-action:none;
      }
      #photocrop-stage:active { cursor:grabbing; }
      #photocrop-stage-inner {
        position:absolute; inset:0;
      }

      #photocrop-img {
        position:absolute;
        transform-origin:center center;
        pointer-events:none; will-change:transform;
        image-rendering:auto;
      }

      /* Máscara: oscurece fuera del círculo */
      #photocrop-mask {
        position:absolute; inset:0; pointer-events:none;
        box-shadow: inset 0 0 0 9999px rgba(0,0,0,0.60);
        border-radius:12px;
      }
      /* El hueco circular limpio */
      #photocrop-circle-cut {
        position:absolute; pointer-events:none;
        border-radius:50%;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.60);
        border: 2px solid rgba(47,164,64,0.75);
        box-sizing:border-box;
      }

      #photocrop-hint {
        text-align:center; font-size:11.5px;
        color:rgba(255,255,255,0.35); margin:-4px 0 -4px; font-family:inherit;
      }

      #photocrop-zoom-row {
        display:flex; align-items:center; gap:10px;
      }
      #photocrop-zoom-row i { color:rgba(255,255,255,0.4); font-size:13px; flex-shrink:0; }
      #photocrop-zoom {
        flex:1; -webkit-appearance:none; appearance:none;
        height:4px; border-radius:4px;
        background:rgba(255,255,255,0.12); outline:none; cursor:pointer;
      }
      #photocrop-zoom::-webkit-slider-thumb {
        -webkit-appearance:none; width:16px; height:16px; border-radius:50%;
        background:#2FA440; box-shadow:0 0 0 3px rgba(47,164,64,0.28); cursor:pointer;
        transition:box-shadow .15s;
      }
      #photocrop-zoom::-webkit-slider-thumb:hover { box-shadow:0 0 0 5px rgba(47,164,64,0.38); }
      #photocrop-zoom::-moz-range-thumb {
        width:16px; height:16px; border:none; border-radius:50%;
        background:#2FA440; cursor:pointer;
      }

      #photocrop-footer { display:flex; gap:10px; justify-content:flex-end; }
      #photocrop-cancel {
        background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.11);
        border-radius:10px; color:rgba(255,255,255,0.7); font-size:13px; font-weight:500;
        padding:9px 20px; cursor:pointer; transition:background .15s; font-family:inherit;
      }
      #photocrop-cancel:hover { background:rgba(255,255,255,0.11); }
      #photocrop-confirm {
        background:#2FA440; border:none; border-radius:10px;
        color:#fff; font-size:13px; font-weight:600;
        padding:9px 22px; cursor:pointer;
        transition:background .15s,transform .1s,opacity .15s;
        display:flex; align-items:center; gap:7px; font-family:inherit;
      }
      #photocrop-confirm:hover { background:#238033; }
      #photocrop-confirm:active { transform:scale(.97); }
      #photocrop-confirm[disabled] { opacity:.6; pointer-events:none; }
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════
   * Estado
   * ═══════════════════════════════════════════════════════ */
  const st = {
    scale:1, minScale:1, maxScale:4,
    ox:0, oy:0,                   // offset del centro de la imagen desde el centro del stage
    dragging:false, sx:0, sy:0,   // inicio del drag
    imgW:0, imgH:0,               // tamaño natural de la imagen
    stageW:0, stageH:0,           // tamaño del stage en px
    circleR:0,                    // radio del círculo en px
    onConfirm:null,
  };
  let lastPinchDist = null;

  /* ═══════════════════════════════════════════════════════
   * Helpers
   * ═══════════════════════════════════════════════════════ */

  /** Impide que la imagen deje zona vacía dentro del círculo */
  function clamp(ox, oy, scale) {
    const hw = (st.imgW * scale) / 2;   // semiancho imagen renderizada
    const hh = (st.imgH * scale) / 2;
    const r  = st.circleR;
    // El borde de la imagen no puede retroceder más allá del radio del círculo
    const maxOx = hw - r;
    const maxOy = hh - r;
    return {
      x: Math.min(maxOx, Math.max(-maxOx, ox)),
      y: Math.min(maxOy, Math.max(-maxOy, oy)),
    };
  }

  function applyTransform() {
    const img = document.getElementById('photocrop-img');
    if (!img) return;
    const cx = st.stageW / 2 + st.ox;
    const cy = st.stageH / 2 + st.oy;
    img.style.left      = cx + 'px';
    img.style.top       = cy + 'px';
    img.style.transform = `translate(-50%,-50%) scale(${st.scale})`;
  }

  function setScale(newScale) {
    st.scale = Math.min(st.maxScale, Math.max(st.minScale, newScale));
    const c = clamp(st.ox, st.oy, st.scale);
    st.ox = c.x; st.oy = c.y;
    const slider = document.getElementById('photocrop-zoom');
    if (slider) slider.value = st.scale;
    applyTransform();
  }

  /* ═══════════════════════════════════════════════════════
   * Mouse events
   * ═══════════════════════════════════════════════════════ */
  function onMD(e) {
    e.preventDefault();
    st.dragging = true;
    st.sx = e.clientX - st.ox;
    st.sy = e.clientY - st.oy;
  }
  function onMM(e) {
    if (!st.dragging) return;
    const c = clamp(e.clientX - st.sx, e.clientY - st.sy, st.scale);
    st.ox = c.x; st.oy = c.y;
    applyTransform();
  }
  function onMU() { st.dragging = false; }

  function onWheel(e) {
    e.preventDefault();
    setScale(st.scale + (e.deltaY < 0 ? 0.07 : -0.07));
  }

  /* ═══════════════════════════════════════════════════════
   * Touch events
   * ═══════════════════════════════════════════════════════ */
  function pinchDist(e) {
    const [a, b] = e.touches;
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }
  function onTS(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      st.dragging = true;
      st.sx = e.touches[0].clientX - st.ox;
      st.sy = e.touches[0].clientY - st.oy;
      lastPinchDist = null;
    } else if (e.touches.length === 2) {
      lastPinchDist = pinchDist(e);
      st.dragging = false;
    }
  }
  function onTM(e) {
    e.preventDefault();
    if (e.touches.length === 1 && st.dragging) {
      const c = clamp(e.touches[0].clientX - st.sx, e.touches[0].clientY - st.sy, st.scale);
      st.ox = c.x; st.oy = c.y;
      applyTransform();
    } else if (e.touches.length === 2 && lastPinchDist) {
      const d = pinchDist(e);
      setScale(st.scale * (d / lastPinchDist));
      lastPinchDist = d;
    }
  }
  function onTE() { st.dragging = false; lastPinchDist = null; }

  /* ═══════════════════════════════════════════════════════
   * Construir modal
   * ═══════════════════════════════════════════════════════ */
  function buildModal() {
    const old = document.getElementById('photocrop-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'photocrop-overlay';
    overlay.innerHTML = `
      <div id="photocrop-modal">
        <div id="photocrop-header">
          <h3><i class="bi bi-person-circle" style="margin-right:7px;color:#2FA440;font-size:17px;"></i>Editar foto de perfil</h3>
          <button id="photocrop-close" title="Cancelar"><i class="bi bi-x-lg"></i></button>
        </div>
        <div id="photocrop-stage">
          <div id="photocrop-stage-inner">
            <img id="photocrop-img" alt="" draggable="false" />
            <div id="photocrop-circle-cut"></div>
          </div>
        </div>
        <p id="photocrop-hint">
          <i class="bi bi-arrows-move" style="margin-right:5px;"></i>
          Arrastra para reencuadrar · scroll o pellizca para zoom
        </p>
        <div id="photocrop-zoom-row">
          <i class="bi bi-zoom-out"></i>
          <input type="range" id="photocrop-zoom" step="0.001" />
          <i class="bi bi-zoom-in"></i>
        </div>
        <div id="photocrop-footer">
          <button id="photocrop-cancel">Cancelar</button>
          <button id="photocrop-confirm">
            <i class="bi bi-check2"></i> Guardar foto
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  /* ═══════════════════════════════════════════════════════
   * Medir stage y posicionar círculo — con retry hasta tener tamaño real
   * ═══════════════════════════════════════════════════════ */
  function measureStage() {
    return new Promise((resolve) => {
      function tryMeasure(attempts) {
        const stage = document.getElementById('photocrop-stage-inner');
        if (!stage) { resolve(200); return; }
        const rect = stage.getBoundingClientRect();
        if (rect.width > 0) {
          resolve(rect.width);
        } else if (attempts > 0) {
          requestAnimationFrame(() => tryMeasure(attempts - 1));
        } else {
          // Fallback: leer del modal con min()
          const modal = document.getElementById('photocrop-modal');
          const mw = modal ? modal.getBoundingClientRect().width - 48 : 300;
          resolve(mw > 0 ? mw : 300);
        }
      }
      // Dar tiempo al browser para pintar
      setTimeout(() => requestAnimationFrame(() => tryMeasure(10)), 30);
    });
  }

  /* ═══════════════════════════════════════════════════════
   * Inicializar imagen en el stage
   * ═══════════════════════════════════════════════════════ */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = document.getElementById('photocrop-img');
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
      img.src = src;
    });
  }

  async function setupStage(src) {
    const [img, stageSize] = await Promise.all([loadImage(src), measureStage()]);

    st.stageW = stageSize;
    st.stageH = stageSize;
    st.imgW   = img.naturalWidth;
    st.imgH   = img.naturalHeight;
    st.circleR = stageSize * 0.43;   // radio del círculo = 86% del stage

    // Posicionar y dimensionar el círculo de recorte
    const circ = document.getElementById('photocrop-circle-cut');
    if (circ) {
      const d = st.circleR * 2;
      circ.style.cssText = `
        position:absolute;
        width:${d}px; height:${d}px;
        left:50%; top:50%;
        transform:translate(-50%,-50%);
        border-radius:50%;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.62);
        border: 2px solid rgba(47,164,64,0.75);
        box-sizing:border-box;
        pointer-events:none;
      `;
    }

    // Escala mínima: imagen debe cubrir el círculo completamente
    const minByW = (st.circleR * 2) / st.imgW;
    const minByH = (st.circleR * 2) / st.imgH;
    st.minScale = Math.max(minByW, minByH);
    st.maxScale = st.minScale * 4;
    st.scale    = st.minScale;
    st.ox = 0; st.oy = 0;

    // Configurar slider
    const slider = document.getElementById('photocrop-zoom');
    if (slider) {
      slider.min   = st.minScale;
      slider.max   = st.maxScale;
      slider.step  = st.minScale * 0.005;
      slider.value = st.minScale;
    }

    applyTransform();
  }

  /* ═══════════════════════════════════════════════════════
   * Exportar crop como Blob JPEG
   * ═══════════════════════════════════════════════════════ */
  function exportCrop(outputSize) {
    outputSize = outputSize || 400;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = outputSize;
    const ctx = canvas.getContext('2d');

    // Clip circular
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();

    // Mapeo: el círculo visible (radio st.circleR en stage) → outputSize
    const ratio = outputSize / (st.circleR * 2);

    // Centro de la imagen en el stage
    const imgCX = st.stageW / 2 + st.ox;
    const imgCY = st.stageH / 2 + st.oy;

    // Centro del stage
    const stageCX = st.stageW / 2;
    const stageCY = st.stageH / 2;

    // Offset del centro de la imagen respecto al centro del círculo
    const dxStage = imgCX - stageCX;
    const dyStage = imgCY - stageCY;

    // Tamaño de la imagen renderizada en canvas de salida
    const outW = st.imgW * st.scale * ratio;
    const outH = st.imgH * st.scale * ratio;

    // Posición del origen (top-left) de la imagen en canvas de salida
    const outX = outputSize / 2 + dxStage * ratio - outW / 2;
    const outY = outputSize / 2 + dyStage * ratio - outH / 2;

    const imgEl = document.getElementById('photocrop-img');
    ctx.drawImage(imgEl, outX, outY, outW, outH);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  }

  /* ═══════════════════════════════════════════════════════
   * Adjuntar eventos
   * ═══════════════════════════════════════════════════════ */
  function attachEvents(overlay) {
    const stage   = document.getElementById('photocrop-stage-inner');
    const slider  = document.getElementById('photocrop-zoom');
    const btnConf = document.getElementById('photocrop-confirm');
    const btnCan  = document.getElementById('photocrop-cancel');
    const btnX    = document.getElementById('photocrop-close');

    // Mouse
    stage.addEventListener('mousedown',  onMD);
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup',   onMU);

    // Wheel
    stage.addEventListener('wheel', onWheel, { passive: false });

    // Touch
    stage.addEventListener('touchstart', onTS, { passive: false });
    stage.addEventListener('touchmove',  onTM, { passive: false });
    stage.addEventListener('touchend',   onTE);
    stage.addEventListener('touchcancel',onTE);

    // Slider
    slider.addEventListener('input', () => setScale(parseFloat(slider.value)));

    // Cerrar
    const closeModal = () => {
      overlay.style.animation = 'pc-fadein .14s ease reverse';
      setTimeout(() => { overlay.remove(); }, 130);
    };
    btnCan.addEventListener('click', closeModal);
    btnX.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    // Confirmar
    btnConf.addEventListener('click', async () => {
      btnConf.setAttribute('disabled', '');
      btnConf.innerHTML = '<i class="bi bi-hourglass-split"></i> Procesando...';
      try {
        const blob = await exportCrop(400);
        if (blob && st.onConfirm) await st.onConfirm(blob);
        closeModal();
      } catch (err) {
        console.error('[PhotoCrop] Error al exportar:', err);
        btnConf.removeAttribute('disabled');
        btnConf.innerHTML = '<i class="bi bi-check2"></i> Guardar foto';
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
   * API pública
   * ═══════════════════════════════════════════════════════ */
  async function open(file, options) {
    if (!file) return;
    st.onConfirm = (options && options.onConfirm) || null;

    // Crear ObjectURL antes de insertar el modal
    const src = URL.createObjectURL(file);

    const overlay = buildModal();
    attachEvents(overlay);

    try {
      await setupStage(src);
    } catch (err) {
      console.error('[PhotoCrop] Error al inicializar:', err);
      overlay.remove();
      URL.revokeObjectURL(src);
    }
  }

  global.PhotoCrop = { open };

})(window);