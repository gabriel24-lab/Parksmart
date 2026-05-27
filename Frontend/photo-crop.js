/**
 * photo-crop.js — Editor de foto de perfil estilo Facebook
 * Parksmart · Módulo reutilizable para todos los roles
 *
 * Uso:
 *   PhotoCrop.open(file, { onConfirm: (blob) => { ... } });
 *
 * Requiere: Bootstrap Icons (bi) ya incluido en el proyecto.
 */

(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════
   * CSS — inyectado una sola vez al cargar el módulo
   * ═══════════════════════════════════════════════════════ */
  const STYLE_ID = 'photocrop-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* ── Overlay ── */
      #photocrop-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(0,0,0,0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        animation: pc-fadein .18s ease;
      }
      @keyframes pc-fadein {
        from { opacity:0; } to { opacity:1; }
      }

      /* ── Modal ── */
      #photocrop-modal {
        background: #1a1a1c;
        border: 1px solid rgba(255,255,255,0.13);
        border-radius: 18px;
        padding: 28px 28px 22px;
        width: min(420px, 94vw);
        box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        animation: pc-slidein .22s cubic-bezier(.22,.9,.36,1);
        display: flex;
        flex-direction: column;
        gap: 18px;
        user-select: none;
      }
      @keyframes pc-slidein {
        from { opacity:0; transform: translateY(18px) scale(.97); }
        to   { opacity:1; transform: translateY(0) scale(1); }
      }

      /* ── Header ── */
      #photocrop-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      #photocrop-header h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: #fff;
        letter-spacing: .01em;
      }
      #photocrop-close {
        background: rgba(255,255,255,0.07);
        border: none;
        border-radius: 50%;
        width: 30px; height: 30px;
        display: flex; align-items: center; justify-content: center;
        color: rgba(255,255,255,0.55);
        cursor: pointer;
        font-size: 15px;
        transition: background .15s, color .15s;
      }
      #photocrop-close:hover { background: rgba(255,255,255,0.14); color:#fff; }

      /* ── Canvas stage ── */
      #photocrop-stage {
        position: relative;
        width: 100%;
        aspect-ratio: 1;
        background: #111;
        border-radius: 12px;
        overflow: hidden;
        cursor: grab;
        touch-action: none;
      }
      #photocrop-stage:active { cursor: grabbing; }

      /* Imagen arrastrable */
      #photocrop-img {
        position: absolute;
        transform-origin: center center;
        pointer-events: none;
        will-change: transform;
      }

      /* Máscara circular */
      #photocrop-mask {
        position: absolute;
        inset: 0;
        pointer-events: none;
        /* oscurece todo menos el círculo central */
        background: radial-gradient(
          circle 44% at 50% 50%,
          transparent 100%,
          rgba(0,0,0,0.68) 100%
        );
      }
      /* Borde del círculo */
      #photocrop-ring {
        position: absolute;
        pointer-events: none;
        left: 50%; top: 50%;
        transform: translate(-50%,-50%);
        width: 88%; height: 88%;
        border-radius: 50%;
        border: 2px solid rgba(47,164,64,0.7);
        box-shadow: 0 0 0 1px rgba(47,164,64,0.25);
      }

      /* ── Zoom slider ── */
      #photocrop-zoom-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      #photocrop-zoom-row i {
        color: rgba(255,255,255,0.4);
        font-size: 13px;
        flex-shrink: 0;
      }
      #photocrop-zoom {
        flex: 1;
        -webkit-appearance: none;
        appearance: none;
        height: 4px;
        border-radius: 4px;
        background: rgba(255,255,255,0.12);
        outline: none;
        cursor: pointer;
      }
      #photocrop-zoom::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px; height: 16px;
        border-radius: 50%;
        background: #2FA440;
        box-shadow: 0 0 0 3px rgba(47,164,64,0.25);
        cursor: pointer;
        transition: box-shadow .15s;
      }
      #photocrop-zoom::-webkit-slider-thumb:hover {
        box-shadow: 0 0 0 5px rgba(47,164,64,0.35);
      }
      #photocrop-zoom::-moz-range-thumb {
        width: 16px; height: 16px;
        border: none;
        border-radius: 50%;
        background: #2FA440;
        cursor: pointer;
      }

      /* ── Hint text ── */
      #photocrop-hint {
        text-align: center;
        font-size: 11.5px;
        color: rgba(255,255,255,0.35);
        margin-top: -6px;
      }

      /* ── Footer buttons ── */
      #photocrop-footer {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      #photocrop-cancel {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.11);
        border-radius: 10px;
        color: rgba(255,255,255,0.7);
        font-size: 13px;
        font-weight: 500;
        padding: 9px 20px;
        cursor: pointer;
        transition: background .15s;
      }
      #photocrop-cancel:hover { background: rgba(255,255,255,0.11); }
      #photocrop-confirm {
        background: #2FA440;
        border: none;
        border-radius: 10px;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        padding: 9px 22px;
        cursor: pointer;
        transition: background .15s, transform .1s;
        display: flex; align-items: center; gap: 7px;
      }
      #photocrop-confirm:hover { background: #238033; }
      #photocrop-confirm:active { transform: scale(.97); }
      #photocrop-confirm.loading {
        opacity: .7; pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  /* ═══════════════════════════════════════════════════════
   * Estado interno
   * ═══════════════════════════════════════════════════════ */
  let state = {
    scale: 1,
    minScale: 1,
    maxScale: 4,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    startX: 0,
    startY: 0,
    imgNaturalW: 0,
    imgNaturalH: 0,
    stageSize: 0,
    onConfirm: null,
  };

  /* ═══════════════════════════════════════════════════════
   * Helpers de posición
   * ═══════════════════════════════════════════════════════ */
  function clampOffset(ox, oy, scale) {
    const { stageSize, imgNaturalW, imgNaturalH } = state;
    // Tamaño de la imagen renderizada
    const rw = imgNaturalW * scale;
    const rh = imgNaturalH * scale;

    // Radio del círculo visible (88% del stage)
    const circleR = stageSize * 0.44;

    // La imagen no puede dejar espacio vacío dentro del círculo
    const maxOX =  rw / 2 - circleR;
    const maxOY =  rh / 2 - circleR;
    const minOX = -rw / 2 + circleR;
    const minOY = -rh / 2 + circleR;

    return {
      x: Math.min(maxOX, Math.max(minOX, ox)),
      y: Math.min(maxOY, Math.max(minOY, oy)),
    };
  }

  function applyTransform() {
    const img = document.getElementById('photocrop-img');
    if (!img) return;
    const { offsetX, offsetY, scale, stageSize } = state;
    const cx = stageSize / 2 + offsetX;
    const cy = stageSize / 2 + offsetY;
    img.style.left = `${cx}px`;
    img.style.top  = `${cy}px`;
    img.style.transform = `translate(-50%,-50%) scale(${scale})`;
  }

  /* ═══════════════════════════════════════════════════════
   * Eventos — Mouse
   * ═══════════════════════════════════════════════════════ */
  function onMouseDown(e) {
    e.preventDefault();
    state.dragging = true;
    state.startX = e.clientX - state.offsetX;
    state.startY = e.clientY - state.offsetY;
  }
  function onMouseMove(e) {
    if (!state.dragging) return;
    const raw = { x: e.clientX - state.startX, y: e.clientY - state.startY };
    const clamped = clampOffset(raw.x, raw.y, state.scale);
    state.offsetX = clamped.x;
    state.offsetY = clamped.y;
    applyTransform();
  }
  function onMouseUp()  { state.dragging = false; }
  function onMouseLeave() { state.dragging = false; }

  /* ── Wheel zoom ── */
  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    const newScale = Math.min(state.maxScale, Math.max(state.minScale, state.scale + delta));
    state.scale = newScale;
    const clamped = clampOffset(state.offsetX, state.offsetY, newScale);
    state.offsetX = clamped.x;
    state.offsetY = clamped.y;
    document.getElementById('photocrop-zoom').value = newScale;
    applyTransform();
  }

  /* ═══════════════════════════════════════════════════════
   * Eventos — Touch
   * ═══════════════════════════════════════════════════════ */
  let lastTouchDist = null;

  function getTouchDist(e) {
    const [a, b] = e.touches;
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      state.dragging = true;
      state.startX = e.touches[0].clientX - state.offsetX;
      state.startY = e.touches[0].clientY - state.offsetY;
      lastTouchDist = null;
    } else if (e.touches.length === 2) {
      lastTouchDist = getTouchDist(e);
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && state.dragging) {
      const raw = {
        x: e.touches[0].clientX - state.startX,
        y: e.touches[0].clientY - state.startY,
      };
      const clamped = clampOffset(raw.x, raw.y, state.scale);
      state.offsetX = clamped.x;
      state.offsetY = clamped.y;
      applyTransform();
    } else if (e.touches.length === 2 && lastTouchDist !== null) {
      const dist = getTouchDist(e);
      const ratio = dist / lastTouchDist;
      lastTouchDist = dist;
      const newScale = Math.min(state.maxScale, Math.max(state.minScale, state.scale * ratio));
      state.scale = newScale;
      const clamped = clampOffset(state.offsetX, state.offsetY, newScale);
      state.offsetX = clamped.x;
      state.offsetY = clamped.y;
      document.getElementById('photocrop-zoom').value = newScale;
      applyTransform();
    }
  }
  function onTouchEnd() { state.dragging = false; lastTouchDist = null; }

  /* ═══════════════════════════════════════════════════════
   * Construir el modal
   * ═══════════════════════════════════════════════════════ */
  function buildModal() {
    // Eliminar si ya existe
    const old = document.getElementById('photocrop-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'photocrop-overlay';

    overlay.innerHTML = `
      <div id="photocrop-modal">
        <div id="photocrop-header">
          <h3><i class="bi bi-person-circle" style="margin-right:7px;color:#2FA440;"></i>Editar foto de perfil</h3>
          <button id="photocrop-close" title="Cancelar"><i class="bi bi-x-lg"></i></button>
        </div>

        <div id="photocrop-stage">
          <img id="photocrop-img" alt="preview" draggable="false" />
          <div id="photocrop-mask"></div>
          <div id="photocrop-ring"></div>
        </div>

        <p id="photocrop-hint">
          <i class="bi bi-arrows-move" style="margin-right:4px;"></i>Arrastra para reencuadrar · scroll o pellizca para hacer zoom
        </p>

        <div id="photocrop-zoom-row">
          <i class="bi bi-zoom-out"></i>
          <input type="range" id="photocrop-zoom" min="1" max="4" step="0.01" value="1" />
          <i class="bi bi-zoom-in"></i>
        </div>

        <div id="photocrop-footer">
          <button id="photocrop-cancel">Cancelar</button>
          <button id="photocrop-confirm">
            <i class="bi bi-check2"></i> Guardar foto
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  /* ═══════════════════════════════════════════════════════
   * Renderizar imagen en el stage
   * ═══════════════════════════════════════════════════════ */
  function setupImage(src) {
    return new Promise((resolve) => {
      const imgEl = document.getElementById('photocrop-img');
      const stage = document.getElementById('photocrop-stage');
      imgEl.onload = () => {
        const stageSize = stage.offsetWidth;
        state.stageSize = stageSize;
        state.imgNaturalW = imgEl.naturalWidth;
        state.imgNaturalH = imgEl.naturalHeight;

        // Escala mínima: la imagen debe cubrir el círculo (88% del stage)
        const circleD = stageSize * 0.88;
        const scaleToFitW = circleD / imgEl.naturalWidth;
        const scaleToFitH = circleD / imgEl.naturalHeight;
        const minScale   = Math.max(scaleToFitW, scaleToFitH);

        state.minScale = minScale;
        state.maxScale = minScale * 4;
        state.scale    = minScale;
        state.offsetX  = 0;
        state.offsetY  = 0;

        // Actualizar slider
        const slider = document.getElementById('photocrop-zoom');
        slider.min   = minScale;
        slider.max   = minScale * 4;
        slider.step  = minScale * 0.01;
        slider.value = minScale;

        applyTransform();
        resolve();
      };
      imgEl.src = src;
    });
  }

  /* ═══════════════════════════════════════════════════════
   * Exportar el crop como Blob
   * ═══════════════════════════════════════════════════════ */
  function exportCrop(outputSize) {
    outputSize = outputSize || 400;
    const { scale, offsetX, offsetY, stageSize, imgNaturalW, imgNaturalH } = state;
    const imgEl = document.getElementById('photocrop-img');

    const canvas = document.createElement('canvas');
    canvas.width  = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');

    // Círculo de recorte
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();

    // Coordenadas del centro de la imagen en el stage
    const imgCX = stageSize / 2 + offsetX;   // píxeles del stage
    const imgCY = stageSize / 2 + offsetY;

    // Centro del stage (= centro del círculo)
    const stageCX = stageSize / 2;
    const stageCY = stageSize / 2;

    // Offset del origen de la imagen respecto al centro del círculo
    const dx = imgCX - stageCX;   // desplazamiento en pantalla
    const dy = imgCY - stageCY;

    // Convertir a espacio del canvas de salida
    // La región del círculo (stageSize * 0.88) se mapea a outputSize
    const circleD = stageSize * 0.88;
    const pixelRatio = outputSize / circleD;

    // Tamaño de la imagen escalada en pantalla
    const renderedW = imgNaturalW * scale;
    const renderedH = imgNaturalH * scale;

    // En canvas de salida
    const outW = renderedW * pixelRatio;
    const outH = renderedH * pixelRatio;
    const outX = outputSize / 2 + dx * pixelRatio - outW / 2;
    const outY = outputSize / 2 + dy * pixelRatio - outH / 2;

    ctx.drawImage(imgEl, outX, outY, outW, outH);

    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92);
    });
  }

  /* ═══════════════════════════════════════════════════════
   * Adjuntar eventos al modal
   * ═══════════════════════════════════════════════════════ */
  function attachEvents(overlay) {
    const stage   = document.getElementById('photocrop-stage');
    const slider  = document.getElementById('photocrop-zoom');
    const btnConf = document.getElementById('photocrop-confirm');
    const btnCan  = document.getElementById('photocrop-cancel');
    const btnX    = document.getElementById('photocrop-close');

    // Drag — Mouse
    stage.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    stage.addEventListener('mouseleave', onMouseLeave);

    // Zoom — Wheel
    stage.addEventListener('wheel', onWheel, { passive: false });

    // Touch
    stage.addEventListener('touchstart', onTouchStart, { passive: false });
    stage.addEventListener('touchmove',  onTouchMove,  { passive: false });
    stage.addEventListener('touchend',   onTouchEnd);

    // Slider zoom
    slider.addEventListener('input', () => {
      const newScale = parseFloat(slider.value);
      state.scale = newScale;
      const clamped = clampOffset(state.offsetX, state.offsetY, newScale);
      state.offsetX = clamped.x;
      state.offsetY = clamped.y;
      applyTransform();
    });

    // Cancelar
    const close = () => {
      overlay.style.animation = 'pc-fadein .15s ease reverse';
      setTimeout(() => overlay.remove(), 140);
    };
    btnCan.addEventListener('click', close);
    btnX.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Confirmar
    btnConf.addEventListener('click', async () => {
      btnConf.classList.add('loading');
      btnConf.innerHTML = '<i class="bi bi-hourglass-split"></i> Procesando...';
      try {
        const blob = await exportCrop(400);
        if (state.onConfirm) await state.onConfirm(blob);
        close();
      } catch (err) {
        console.error('[PhotoCrop] Error al exportar:', err);
        btnConf.classList.remove('loading');
        btnConf.innerHTML = '<i class="bi bi-check2"></i> Guardar foto';
      }
    });
  }

  /* ═══════════════════════════════════════════════════════
   * API pública
   * ═══════════════════════════════════════════════════════ */

  /**
   * PhotoCrop.open(file, options)
   *   file       — File object de <input type="file">
   *   options    — { onConfirm: async (blob) => {} }
   */
  async function open(file, options) {
    if (!file) return;
    options = options || {};
    state.onConfirm = options.onConfirm || null;

    const src = URL.createObjectURL(file);
    const overlay = buildModal();
    attachEvents(overlay);

    // Esperar un frame para que el DOM esté pintado y offsetWidth sea correcto
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await setupImage(src);
  }

  global.PhotoCrop = { open };
})(window);
