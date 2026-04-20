document.addEventListener("DOMContentLoaded", () => {
  const containers = document.querySelectorAll('.background');
  if (!containers.length) return;

  containers.forEach(container => {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-animation-canvas';
    Object.assign(canvas.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '0'
    });
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const BRAND = "230,25,45";
    const MAX_DIST = 130;
    const MOUSE_DIST = 160;
    let width, height, particles = [];

    // Usa window.innerWidth para evitar reflow forzado
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      particles = [];
      const n = Math.floor((width * height) / 11000);
      for (let i = 0; i < n; i++) particles.push(new Particle());
    };

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 1.5 + 0.8;
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = (Math.random() - 0.5) * 0.8;
        this.brand = Math.random() > 0.4;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x > width || this.x < 0) this.vx *= -1;
        if (this.y > height || this.y < 0) this.vy *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.brand ? `rgba(${BRAND},.7)` : 'rgba(255,255,255,.5)';
        ctx.fill();
      }
    }

    let mouse = { x: null, y: null };
    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
    window.addEventListener('mouseout', () => { mouse.x = null; mouse.y = null; });

    // Debounce resize para no disparar reflow repetido
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    }, { passive: true });

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      const len = particles.length;

      for (let i = 0; i < len; i++) {
        particles[i].update();
        particles[i].draw();

        for (let j = i + 1; j < len; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_DIST) {
            const op = 1 - d / MAX_DIST;
            ctx.beginPath();
            ctx.strokeStyle = (particles[i].brand || particles[j].brand)
              ? `rgba(${BRAND},${op * 0.4})`
              : `rgba(255,255,255,${op * 0.2})`;
            ctx.lineWidth = 0.6;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }

        if (mouse.x !== null) {
          const dx = particles[i].x - mouse.x;
          const dy = particles[i].y - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MOUSE_DIST) {
            const op = 1 - d / MOUSE_DIST;
            ctx.beginPath();
            ctx.strokeStyle = particles[i].brand
              ? `rgba(${BRAND},${op * 0.6})`
              : `rgba(255,255,255,${op * 0.4})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(animate);
    };

    resize();
    animate();
  });
});