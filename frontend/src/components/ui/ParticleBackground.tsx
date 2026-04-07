import React, { useEffect, useRef } from 'react';

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particlesArray: Particle[] = [];
    let animationFrameId: number;

    const mouse = {
      x: undefined as number | undefined,
      y: undefined as number | undefined,
      radius: 80 // Radius of repel effect
    };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = undefined;
      mouse.y = undefined;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    class Particle {
      x: number;
      y: number;
      size: number;
      density: number;
      vx: number;
      vy: number;
      baseOpacity: number;

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 0.8 + 0.2; // 0.2px to 1.0px (tiny specks)
        this.density = (Math.random() * 20) + 1;

        // Random drift (increased speed for smoother perceived flow)
        this.vx = (Math.random() - 0.5) * 2.5;
        this.vy = (Math.random() - 0.5) * 2.5;

        // Base opacity based on size to give pseudo 3D effect
        this.baseOpacity = Math.max(0.4, this.size);
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);

        // Strictly orange (#E8641F)
        ctx.fillStyle = `rgba(232, 100, 31, ${this.baseOpacity})`;
        ctx.fill();
        ctx.closePath();
      }

      update() {
        // Natural drift
        this.x += this.vx;
        this.y += this.vy;

        // Wrap around edges instead of hard bouncing for smoother aesthetic
        if (this.x < 0) this.x = canvas!.width;
        if (this.x > canvas!.width) this.x = 0;
        if (this.y < 0) this.y = canvas!.height;
        if (this.y > canvas!.height) this.y = 0;

        // Mouse collision / repel
        if (mouse.x != null && mouse.y != null) {
          let dx = mouse.x - this.x;
          let dy = mouse.y - this.y;
          let distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < mouse.radius) {
            let forceDirectionX = dx / distance;
            let forceDirectionY = dy / distance;
            let force = (mouse.radius - distance) / mouse.radius;
            // Push away
            let directionX = forceDirectionX * force * this.density;
            let directionY = forceDirectionY * force * this.density;

            this.x -= directionX;
            this.y -= directionY;
          }
        }
      }
    }

    const init = () => {
      particlesArray = [];
      // Calculate amount of particles based on screen size - reduced density for performance (1 per 1000px)
      const numberOfParticles = Math.min(Math.floor((canvas.width * canvas.height) / 1000), 400);
      for (let i = 0; i < numberOfParticles; i++) {
        let x = Math.random() * canvas.width;
        let y = Math.random() * canvas.height;
        particlesArray.push(new Particle(x, y));
      }
    };

    const animate = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    // Force canvas to match screen resolution initially
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init();
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
      style={{ background: 'transparent' }}
    />
  );
}
