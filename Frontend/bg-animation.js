document.addEventListener("DOMContentLoaded", () => {
    // Seleccionar todos los contenedores con clase 'background'
    const containers = document.querySelectorAll('.background');
    if (containers.length === 0) return;

    containers.forEach(container => {
        // Crear elemento canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'bg-animation-canvas';
        
        // Estilos para que el canvas cubra todo el fondo sin afectar interacciones
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none'; // Permite hacer click a través del canvas
        canvas.style.zIndex = '0'; // Se ubica detrás del contenido principal pero por encima de la imagen de fondo
        
        // Agregar canvas al contenedor
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];
        
        // Configuración de la animación
        const BRAND_COLOR = "230, 25, 45"; // Color principal: #e6192d en RGB
        const MAX_DISTANCE = 130; // Distancia máxima para dibujar conexiones
        const MOUSE_DISTANCE = 160; // Distancia de interacción con el cursor

        const initCanvas = () => {
            width = container.clientWidth || window.innerWidth;
            height = container.clientHeight || window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            particles = [];
            
            // Densidad de part\u00edculas optimizada para rendimiento y estética
            const numParticles = Math.floor((width * height) / 11000);
            
            for(let i=0; i<numParticles; i++) {
                particles.push(new Particle());
            }
        };

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.size = Math.random() * 1.5 + 0.8;
                // Velocidades lentas para un flujo elegante
                this.speedX = (Math.random() * 0.8) - 0.4;
                this.speedY = (Math.random() * 0.8) - 0.4;
                // Mezcla entre rojo marca y blanco tenue
                this.isBrandColor = Math.random() > 0.4; 
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                // Rebote en los bordes
                if(this.x > width || this.x < 0) this.speedX *= -1;
                if(this.y > height || this.y < 0) this.speedY *= -1;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                if (this.isBrandColor) {
                    ctx.fillStyle = `rgba(${BRAND_COLOR}, 0.7)`;
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                }
                ctx.fill();
            }
        }

        // Capturar posici\u00f3n del mouse
        let mouse = { x: null, y: null };
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });
        window.addEventListener('mouseout', () => {
            mouse.x = null;
            mouse.y = null;
        });

        const animate = () => {
            // Efecto de rastro suave
            ctx.clearRect(0, 0, width, height);

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                // Conexiones entre part\u00edculas
                for (let j = i; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < MAX_DISTANCE) {
                        ctx.beginPath();
                        const opacity = 1 - (distance / MAX_DISTANCE);
                        if (particles[i].isBrandColor || particles[j].isBrandColor) {
                            ctx.strokeStyle = `rgba(${BRAND_COLOR}, ${opacity * 0.4})`;
                        } else {
                            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
                        }
                        ctx.lineWidth = 0.6;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                        ctx.closePath();
                    }
                }

                // Conectividad interactiva con el mouse
                if (mouse.x && mouse.y) {
                    const dx = particles[i].x - mouse.x;
                    const dy = particles[i].y - mouse.y;
                    const distance = Math.sqrt(dx*dx + dy*dy);
                    
                    if (distance < MOUSE_DISTANCE) {
                         ctx.beginPath();
                         const opacity = 1 - (distance / MOUSE_DISTANCE);
                         if (particles[i].isBrandColor) {
                             ctx.strokeStyle = `rgba(${BRAND_COLOR}, ${opacity * 0.6})`;
                         } else {
                             ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.4})`;
                         }
                         ctx.lineWidth = 1;
                         ctx.moveTo(particles[i].x, particles[i].y);
                         ctx.lineTo(mouse.x, mouse.y);
                         ctx.stroke();
                         ctx.closePath();
                    }
                }
            }
            requestAnimationFrame(animate);
        };

        // Iniciar todo
        initCanvas();
        animate();

        // Manejar redimensionamiento de pantalla
        window.addEventListener('resize', initCanvas);
    });
});
