/**
 * custom-select.js — Parksmart
 * Reemplaza los <select> nativos por dropdowns custom totalmente estilizables.
 * Compatible con Chrome/Windows donde el OS ignora el CSS de las <option>.
 *
 * USO: agregar al final del <body> en superadmin.html y dashboard.html:
 *   <script src="/Frontend/custom-select.js"></script>
 *
 * Se inicializa solo en DOMContentLoaded. Re-exporta el valor al <select>
 * original (oculto) para que toda la lógica JS existente siga funcionando
 * sin cambios (getElementById, .value, onchange, etc.).
 */

(function () {
  'use strict';

  /* ── Estilos inyectados una sola vez ─────────────────────────────── */
  const CSS = `
    .cs-wrapper {
      position: relative;
      width: 100%;
      font-family: 'DM Sans', 'Inter', sans-serif;
      font-size: 13px;
      box-sizing: border-box;
    }
    .cs-wrapper * { box-sizing: border-box; }

    .cs-trigger {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 11px 14px;
      border-radius: 10px;
      border: 1.5px solid rgba(255,255,255,0.22);
      background: rgba(255,255,255,0.06);
      color: #fff;
      cursor: pointer;
      user-select: none;
      transition: border-color .15s, background .15s;
      min-height: 42px;
    }
    .cs-trigger:hover {
      border-color: rgba(255,255,255,0.38);
      background: rgba(255,255,255,0.09);
    }
    .cs-trigger.open {
      border-color: #2FA440;
      box-shadow: 0 0 0 3px rgba(47,164,64,0.22);
    }
    .cs-trigger .cs-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #fff;
    }
    .cs-trigger .cs-label.placeholder {
      color: rgba(255,255,255,0.4);
    }
    .cs-trigger .cs-arrow {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform .2s;
      color: rgba(255,255,255,0.5);
    }
    .cs-trigger.open .cs-arrow {
      transform: rotate(180deg);
      color: #2FA440;
    }

    .cs-dropdown {
      position: absolute;
      top: calc(100% + 5px);
      left: 0;
      right: 0;
      z-index: 9999;
      background: #1a2a1e;
      border: 1.5px solid rgba(47,164,64,0.4);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.45);
      opacity: 0;
      transform: translateY(-6px);
      pointer-events: none;
      transition: opacity .15s, transform .15s;
      max-height: 260px;
      overflow-y: auto;
    }
    .cs-dropdown.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    /* Dropdown abre hacia arriba cuando no hay espacio abajo */
    .cs-dropdown.drop-up {
      top: auto;
      bottom: calc(100% + 5px);
      transform: translateY(6px);
    }
    .cs-dropdown.drop-up.open {
      transform: translateY(0);
    }
    /* Scrollbar del dropdown */
    .cs-dropdown::-webkit-scrollbar { width: 4px; }
    .cs-dropdown::-webkit-scrollbar-track { background: transparent; }
    .cs-dropdown::-webkit-scrollbar-thumb { background: rgba(47,164,64,0.4); border-radius: 2px; }

    .cs-option {
      padding: 10px 14px;
      color: rgba(255,255,255,0.85);
      cursor: pointer;
      transition: background .1s, color .1s;
      font-size: 13px;
      line-height: 1.4;
    }
    .cs-option:hover {
      background: rgba(47,164,64,0.18);
      color: #fff;
    }
    .cs-option.selected {
      background: rgba(47,164,64,0.28);
      color: #2FA440;
      font-weight: 500;
    }
    .cs-option.disabled {
      color: rgba(255,255,255,0.25);
      cursor: default;
      pointer-events: none;
    }

    /* Variante para selects dentro de .form-group (fondo claro) */
    .form-group .cs-trigger {
      background: rgba(255,255,255,0.92);
      border-color: rgba(0,0,0,0.18);
      color: #333;
    }
    .form-group .cs-trigger:hover {
      border-color: #2FA440;
      background: #fff;
    }
    .form-group .cs-trigger .cs-label { color: #333; }
    .form-group .cs-trigger .cs-label.placeholder { color: #aaa; }
    .form-group .cs-trigger .cs-arrow { color: #666; }
    .form-group .cs-trigger.open { border-color: #2FA440; }
    .form-group .cs-dropdown {
      background: #fff;
      border-color: rgba(47,164,64,0.45);
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    }
    .form-group .cs-option { color: #333; }
    .form-group .cs-option:hover { background: rgba(47,164,64,0.1); color: #1a5c26; }
    .form-group .cs-option.selected { background: rgba(47,164,64,0.15); color: #2FA440; }
    .form-group .cs-option.disabled { color: #bbb; }

    /* Variante filter-wrap (barra de filtros) */
    .filter-wrap .cs-trigger {
      padding: 8px 12px;
      font-size: 12px;
      min-height: 36px;
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.2);
    }
    .filter-wrap .cs-option { padding: 8px 12px; font-size: 12px; }

    /* Variante sa-rol-select (tabla de usuarios SA) */
    .sa-rol-select + .cs-wrapper .cs-trigger,
    .sa-rol-select.cs-hidden + .cs-wrapper .cs-trigger {
      padding: 5px 10px;
      font-size: 12px;
      min-height: 32px;
      border-radius: 8px;
    }
  `;

  function injectStyles() {
    if (document.getElementById('cs-styles')) return;
    const style = document.createElement('style');
    style.id = 'cs-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ── SVG flecha ───────────────────────────────────────────────────── */
  const ARROW_SVG = `<svg width="12" height="7" viewBox="0 0 12 7" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 1L6 6L11 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  /* ── Construir custom select para un <select> nativo ─────────────── */
  function buildCustomSelect(nativeSelect) {
    if (nativeSelect._csInit) return;
    nativeSelect._csInit = true;

    /* Ocultar el select nativo pero mantenerlo en DOM para que
       getElementById / .value / onChange sigan funcionando */
    nativeSelect.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'cs-wrapper';
    nativeSelect.parentNode.insertBefore(wrapper, nativeSelect.nextSibling);

    /* Trigger (cabecera visible) */
    const trigger = document.createElement('div');
    trigger.className = 'cs-trigger';
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'cs-label';

    const arrow = document.createElement('span');
    arrow.className = 'cs-arrow';
    arrow.innerHTML = ARROW_SVG;

    trigger.appendChild(label);
    trigger.appendChild(arrow);

    /* Dropdown */
    const dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown';
    dropdown.setAttribute('role', 'listbox');

    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);

    /* Poblar opciones */
    function populateOptions() {
      dropdown.innerHTML = '';
      Array.from(nativeSelect.options).forEach((opt, i) => {
        const item = document.createElement('div');
        item.className = 'cs-option';
        item.setAttribute('role', 'option');
        item.dataset.value = opt.value;
        item.dataset.index = i;
        item.textContent = opt.text;
        if (opt.disabled || (!opt.value && i === 0 && opt.text.toLowerCase().includes('selecciona'))) {
          item.classList.add('disabled');
        }
        if (opt.selected) item.classList.add('selected');
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectOption(opt.value, opt.text, item);
        });
        dropdown.appendChild(item);
      });
    }

    /* Actualizar label del trigger */
    function updateLabel() {
      const sel = nativeSelect.options[nativeSelect.selectedIndex];
      if (sel && sel.value) {
        label.textContent = sel.text;
        label.classList.remove('placeholder');
      } else {
        label.textContent = sel ? sel.text : '';
        label.classList.add('placeholder');
      }
    }

    /* Seleccionar opción */
    function selectOption(value, text, item) {
      nativeSelect.value = value;

      /* Disparar evento change para que el código existente lo detecte */
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));

      dropdown.querySelectorAll('.cs-option').forEach(el => el.classList.remove('selected'));
      if (item) item.classList.add('selected');

      updateLabel();
      close();
    }

    /* Abrir / cerrar */
    function open() {
      /* Cerrar cualquier otro dropdown abierto */
      document.querySelectorAll('.cs-trigger.open').forEach(t => {
        if (t !== trigger) t.click();
      });
      trigger.classList.add('open');

      /* Detectar si hay espacio suficiente debajo; si no, abrir hacia arriba */
      dropdown.classList.remove('drop-up');
      const triggerRect = trigger.getBoundingClientRect();
      const dropdownHeight = Math.min(260, dropdown.scrollHeight || 200);
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      if (spaceBelow < dropdownHeight + 10 && spaceAbove > spaceBelow) {
        dropdown.classList.add('drop-up');
      }

      dropdown.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }

    function close() {
      trigger.classList.remove('open');
      dropdown.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function toggle() {
      trigger.classList.contains('open') ? close() : open();
    }

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'Escape') close();
    });

    /* Cerrar al hacer click fuera */
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) close();
    });

    /* Sincronizar si el select nativo cambia por JS */
    nativeSelect.addEventListener('change', () => {
      updateLabel();
      populateOptions();
    });

    /* MutationObserver para cuando las opciones cambien dinámicamente
       (ej: filterCentros rellena #reg-centro, #a-centro, etc.) */
    const observer = new MutationObserver(() => {
      populateOptions();
      updateLabel();
    });
    observer.observe(nativeSelect, { childList: true });

    /* Init */
    populateOptions();
    updateLabel();
  }

  /* ── Selectores a procesar ────────────────────────────────────────── */
  const INCLUDE_SELECTORS = [
    '.form-group select',
    '.filter-wrap select',
    '.sa-rol-select',
    '.scan-action-row select',
    '.inline-select',
    '#pk-centro-select',
    '#pk-f-modo',
    '#pk-f-habilitado',
    '#reg-rol',
    '#reg-tipo-id',
    '#reg-region',
    '#reg-centro',
    '#anal-periodo',
    '#aud-filtro-tipo',
    '#filter-rol',
    '#filter-estado',
    'select[onchange]',
  ];

  /* Selectores a excluir (inputs de file, hidden, etc.) */
  const EXCLUDE = ['[type="hidden"]', '[data-no-custom]'];

  function shouldSkip(el) {
    return EXCLUDE.some(sel => el.matches(sel)) || el._csInit;
  }

  function initAll() {
    const seen = new Set();
    INCLUDE_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!seen.has(el) && !shouldSkip(el)) {
          seen.add(el);
          buildCustomSelect(el);
        }
      });
    });
  }

  /* ── También interceptar selects creados dinámicamente
     (como los que genera renderSAUsersTable) ────────────────────────── */
  function watchDynamic() {
    const mo = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const selects = node.tagName === 'SELECT'
            ? [node]
            : Array.from(node.querySelectorAll('select'));
          selects.forEach(el => {
            if (!shouldSkip(el) && INCLUDE_SELECTORS.some(sel => el.matches(sel))) {
              buildCustomSelect(el);
            }
          });
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Init ─────────────────────────────────────────────────────────── */
  function init() {
    injectStyles();
    initAll();
    watchDynamic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();