import React, { useEffect, useRef } from 'react';

export function SplashGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const drawPillar = (x: number, y: number, z: number, size: number, gridSize: number) => {
      const tileW = size * 2;
      const tileH = size;
      
      // Isometric projection
      // Center the grid on the screen
      const screenX = canvas.width / 2 + (x - y) * tileW / 2;
      const screenY = canvas.height / 2 + (x + y) * tileH / 2 - z;

      // Colors based on position to match the app's indigo/cyan/fuchsia gradient
      // x goes from -gridSize to gridSize
      const xRatio = (x + gridSize) / (gridSize * 2);
      const yRatio = (y + gridSize) / (gridSize * 2);
      
      // Interpolate between indigo (230), cyan (190), fuchsia (290)
      const hue = 230 - (xRatio * 40) + (yRatio * 60);
      
      const normalizedZ = Math.max(0, Math.min(1, z / 60));
      
      // Top face (lightest)
      ctx.fillStyle = `hsla(${hue}, 80%, ${90 + normalizedZ * 10}%, 0.9)`;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + tileW / 2, screenY + tileH / 2);
      ctx.lineTo(screenX, screenY + tileH);
      ctx.lineTo(screenX - tileW / 2, screenY + tileH / 2);
      ctx.closePath();
      ctx.fill();
      
      // Add a subtle stroke to define the edges
      ctx.strokeStyle = `hsla(${hue}, 80%, 100%, 0.6)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Right face (medium)
      ctx.fillStyle = `hsla(${hue}, 70%, ${75 + normalizedZ * 10}%, 0.85)`;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + tileH);
      ctx.lineTo(screenX + tileW / 2, screenY + tileH / 2);
      ctx.lineTo(screenX + tileW / 2, screenY + tileH / 2 + 200); // 200 is the base depth
      ctx.lineTo(screenX, screenY + tileH + 200);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 70%, 85%, 0.3)`;
      ctx.stroke();

      // Left face (darkest)
      ctx.fillStyle = `hsla(${hue}, 60%, ${65 + normalizedZ * 10}%, 0.85)`;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + tileH);
      ctx.lineTo(screenX - tileW / 2, screenY + tileH / 2);
      ctx.lineTo(screenX - tileW / 2, screenY + tileH / 2 + 200);
      ctx.lineTo(screenX, screenY + tileH + 200);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 60%, 75%, 0.3)`;
      ctx.stroke();
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const gridSize = 25; // 51x51 grid for higher density
      const size = 14; // Smaller tiles
      
      const pillars = [];
      for (let x = -gridSize; x <= gridSize; x++) {
        for (let y = -gridSize; y <= gridSize; y++) {
          pillars.push({ x, y });
        }
      }
      
      // Sort back-to-front for isometric drawing
      pillars.sort((a, b) => (a.x + a.y) - (b.x + b.y));

      pillars.forEach(({ x, y }) => {
        // Create a wave effect based on distance from center
        const dist = Math.sqrt(x * x + y * y);
        // The wave moves outward over time
        const z = Math.sin(dist * 0.4 - time * 4) * 30 + 30;
        
        drawPillar(x, y, z, size, gridSize);
      });

      time += 0.01;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
