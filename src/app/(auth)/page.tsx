"use client";

import Form from "@/components/auth/login/form/page";
import SectionBottom from "@/components/auth/login/sectionBottom/sectionBottom";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

class Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.x = Math.random() * canvasWidth;
    this.y = Math.random() * canvasHeight;
    this.z = Math.random() * 1000;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.vz = (Math.random() - 0.5) * 2;
    this.radius = 2;
  }

  update(canvasWidth: number, canvasHeight: number) {
    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vz;

    if (this.x < 0) this.x = canvasWidth;
    if (this.x > canvasWidth) this.x = 0;
    if (this.y < 0) this.y = canvasHeight;
    if (this.y > canvasHeight) this.y = 0;
    if (this.z < 0) this.z = 1000;
    if (this.z > 1000) this.z = 0;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number
  ) {
    const scale = 1000 / (1000 + this.z);
    const x2d = this.x * scale + (canvasWidth / 2) * (1 - scale);
    const y2d = this.y * scale + (canvasHeight / 2) * (1 - scale);
    const radius = this.radius * scale;

    ctx.beginPath();
    ctx.arc(x2d, y2d, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * scale})`;
    ctx.fill();
  }
}

export default function Login() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles: Particle[] = [];
    const particleCount = 80;
    const connectionDistance = 150;

    let rafId = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (!w || !h) return;

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    particles.length = 0;
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle(canvas.clientWidth, canvas.clientHeight));
    }

    const animate = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.update(w, h);
        p.draw(ctx, w, h);
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.hypot(dx, dy);

          if (distance < connectionDistance) {
            const scale1 = 1000 / (1000 + particles[i].z);
            const scale2 = 1000 / (1000 + particles[j].z);
            const opacity =
              (1 - distance / connectionDistance) *
              0.3 *
              Math.min(scale1, scale2);

            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.lineWidth = 1;

            ctx.moveTo(
              particles[i].x * scale1 + (w / 2) * (1 - scale1),
              particles[i].y * scale1 + (h / 2) * (1 - scale1)
            );

            ctx.lineTo(
              particles[j].x * scale2 + (w / 2) * (1 - scale2),
              particles[j].y * scale2 + (h / 2) * (1 - scale2)
            );

            ctx.stroke();
          }
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section className="max-w-7xl mx-auto min-h-screen px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-0 py-10 lg:py-0 min-h-screen lg:items-center">
        
        {/* Left - Animation & Bottom Section */}
        <div className="flex flex-col justify-center py-10 lg:py-20">
          <div className="relative h-64 sm:h-80 lg:h-[500px] mb-6">
            <canvas ref={canvasRef} className="w-full h-full rounded-2xl" />
          </div>
          <SectionBottom />
        </div>

        {/* Vertical Line - Desktop Only */}
        <div className="hidden lg:block relative w-px bg-white/30 my-20">
          <div className="absolute top-0 left-0 w-px bg-white animate-grow-vertical"></div>
        </div>

        {/* Horizontal Line - Mobile Only */}
        <div className="lg:hidden w-full h-px bg-white/30 my-8 relative">
          <div className="absolute left-0 top-0 h-px bg-white animate-grow-horizontal"></div>
        </div>

        {/* Right - Login Form */}
        <div className="flex flex-col justify-center py-10 lg:py-20 lg:pl-12">
          <Form />
        </div>
        
      </div>

      <style jsx>{`
        @keyframes grow-vertical {
          from {
            height: 0%;
            opacity: 0;
          }
          to {
            height: 100%;
            opacity: 1;
          }
        }
        @keyframes grow-horizontal {
          from {
            width: 0%;
            opacity: 0;
          }
          to {
            width: 100%;
            opacity: 1;
          }
        }
        .animate-grow-vertical {
          transform-origin: top;
          animation: grow-vertical 1.5s ease-out forwards;
        }
        .animate-grow-horizontal {
          transform-origin: left;
          animation: grow-horizontal 1.5s ease-out forwards;
        }
      `}</style>
    </section>
  );
}