import React, { useEffect, useRef } from 'react';

const TILE_W = 44;
const TILE_H = 22;
const CITY_SATURATION_BOOST = 0;
const CITY_LIGHTNESS_SHIFT = 20;
const DISSOLVE_BLEND = 0.28;
const DISSOLVE_START_DELAY_MS = 220;
const DISSOLVE_FINAL_HOLD_MS = 180;
const COLLAPSE_NEAR_COMPLETE = 0.985;
const DISSOLVE_HOLD_START = 0.9;
const DISSOLVE_HOLD_LEVEL = 0.92;
const DISSOLVE_COMPLETE_SNAP = 0.995;

export function SplashGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flattenProgressRef = useRef(0);
  const flattenTargetRef = useRef(0);
  const dissolveProgressRef = useRef(0);
  const dissolveDelayUntilRef = useRef<number | null>(null);
  const dissolveCompleteDelayUntilRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // Head-on perspective projection with 3D depth
    const perspective = (x: number, y: number, z: number, tileW: number, tileH: number, originX: number, originY: number, fov: number = 0.05) => {
      const depth = 1 + x * fov;
      const scale = depth > 0 ? 1 / depth : 1;
      return {
        x: originX + y * tileW * scale,
        y: originY - z * tileH * scale,
        scale: scale,
        depth: depth
      };
    };

    const drawPoly = (points: Array<{ x: number; y: number }>, fill: string | CanvasGradient) => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const hash = (x: number, y: number) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    window.addEventListener('resize', resize);
    resize();

    const handleCanvasClick = () => {
      // Click collapses the skyline to a fully flattened state.
      flattenTargetRef.current = 1;
      dissolveDelayUntilRef.current = null;
      dissolveCompleteDelayUntilRef.current = null;
    };

    canvas.addEventListener('click', handleCanvasClick);

    const render = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const nowMs = performance.now();

      const tileW = TILE_W;
      const tileH = TILE_H;
      const radiusX = 40; // Depth layers
      const radiusY = Math.ceil(window.innerWidth / (tileW * 0.6)); // Full width distribution
      const originX = window.innerWidth * 0.5;
      const originY = window.innerHeight - 80;
      const cityScale = 0.7;
      const night = 0;
      const colorCycle = 0;
      const hueShift = 0;
      const pulseLift = 0;
      const sat = (value: number) => clamp(value + CITY_SATURATION_BOOST, 0, 100);
      const light = (value: number) => clamp(value + CITY_LIGHTNESS_SHIFT, 0, 100);

      flattenProgressRef.current += (flattenTargetRef.current - flattenProgressRef.current) * 0.08;
      const heightScale = clamp(1 - flattenProgressRef.current, 0, 1);
      if (flattenTargetRef.current === 1 && flattenProgressRef.current >= COLLAPSE_NEAR_COMPLETE && dissolveDelayUntilRef.current === null) {
        dissolveDelayUntilRef.current = nowMs + DISSOLVE_START_DELAY_MS;
      }
      const dissolveTarget = dissolveDelayUntilRef.current !== null && nowMs >= dissolveDelayUntilRef.current ? 1 : 0;

      if (dissolveTarget === 1 && dissolveProgressRef.current >= DISSOLVE_HOLD_START && dissolveCompleteDelayUntilRef.current === null) {
        dissolveCompleteDelayUntilRef.current = nowMs + DISSOLVE_FINAL_HOLD_MS;
      }
      const completionGateOpen = dissolveCompleteDelayUntilRef.current !== null && nowMs >= dissolveCompleteDelayUntilRef.current;
      const effectiveDissolveTarget = dissolveTarget === 1 ? (completionGateOpen ? 1 : DISSOLVE_HOLD_LEVEL) : 0;

      dissolveProgressRef.current += (effectiveDissolveTarget - dissolveProgressRef.current) * DISSOLVE_BLEND;
      if (dissolveProgressRef.current > DISSOLVE_COMPLETE_SNAP) {
        dissolveProgressRef.current = 1;
      }
      const dissolveProgress = dissolveProgressRef.current;
      const cityVisibility = 1 - dissolveProgress;

      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(cityScale, cityScale);
      ctx.translate(-originX, -originY);
      ctx.globalAlpha = cityVisibility;

      const cells: Array<{ x: number; y: number }> = [];
      for (let y = -radiusY; y <= radiusY; y++) {
        for (let x = -radiusX; x <= radiusX; x++) {
          cells.push({ x, y });
        }
      }

      // Sort by depth (x) then by horizontal position for proper rendering order
      cells.sort((a, b) => a.x - b.x || a.y - b.y);

      cells.forEach(({ x, y }) => {
        // Skip cells outside the visible city
        if (Math.abs(y) > radiusY * 0.95) return;
        
        const proj = perspective(x, y, 0, tileW, tileH, originX, originY);

        // Create zone-based districts
        const downtown = Math.max(0, 1 - Math.hypot(x - 20, y) / (radiusX * 0.6));
        const midtown = Math.max(0, 1 - Math.hypot(x - 10, y - 20) / (radiusX * 0.9));
        const zoneCenter = Math.max(downtown, midtown * 0.72);

        let district: 'residential' | 'commercial' | 'industrial' = 'residential';
        if (zoneCenter > 0.62 || hash(x * 2 + 7, y * 2 - 5) > 0.93) {
          district = 'commercial';
        } else if (hash(x - 6, y + 4) > 0.78) {
          district = 'industrial';
        }

        // Skip if water tile
        const water = Math.abs(y - x * 0.15) < 0.8;
        if (water) return;

        // Calculate building height with animation
        const districtBoost = district === 'commercial' ? 54 : district === 'industrial' ? 18 : 0;
        const baseHeight = 20 + zoneCenter * 118 + districtBoost + hash(x * 3, y * 2) * 20;
        const breathe = 1 + Math.sin(time * 1.35 + hash(x * 1.7, y * 2.3) * Math.PI * 2) * 0.07;
        const h = baseHeight * heightScale * breathe;

        // Building dimensions
        const widthVariance = 0.7 + hash(x * 1.31 + 4.7, y * 0.91 - 2.3) * 0.2;
        const buildingW = tileW * proj.scale * widthVariance;
        const buildingH = (h * proj.scale) / 8;

        // Color based on district and position
        const districtHue = 228 + (y / radiusY) * 92;
        const buildingColor = district === 'commercial'
          ? `hsla(${districtHue + 18}, 78%, ${light(78 - night * 28 + pulseLift * 0.22)}%, 0.92)`
          : district === 'industrial'
            ? `hsla(${districtHue + 10}, 34%, ${light(64 - night * 22 + pulseLift * 0.22)}%, 0.88)`
            : `hsla(${districtHue + 14}, 56%, ${light(74 - night * 24 + pulseLift * 0.22)}%, 0.90)`;

        // Draw building front face
        if (buildingH > 0.5) {
          drawPoly([
            { x: proj.x - buildingW * 0.5, y: proj.y },
            { x: proj.x + buildingW * 0.5, y: proj.y },
            { x: proj.x + buildingW * 0.5, y: proj.y - buildingH },
            { x: proj.x - buildingW * 0.5, y: proj.y - buildingH }
          ], buildingColor);

          // Draw windows
          if (buildingH > 3 && buildingW > 3) {
            const windowSize = Math.max(1, 2.5 * proj.scale);
            const windowsX = Math.floor(buildingW / (windowSize * 1.5));
            const windowsY = Math.floor(buildingH / (windowSize * 1.5));
            
            for (let wx = 0; wx < windowsX; wx++) {
              for (let wy = 0; wy < windowsY; wy++) {
                const windowX = proj.x - buildingW * 0.4 + (wx + 0.5) * (buildingW * 0.8 / windowsX);
                const windowY = proj.y - buildingH * 0.8 + (wy + 0.5) * (buildingH * 0.6 / windowsY);
                
                const isLit = hash(x * 2 + y, wx * 7 + wy * 11) > 0.4;
                ctx.fillStyle = isLit 
                  ? `hsla(${districtHue + 40}, 80%, 65%, 0.7)` 
                  : `hsla(${districtHue}, 30%, 20%, 0.5)`;
                ctx.fillRect(windowX - windowSize/2, windowY - windowSize/2, windowSize, windowSize);
              }
            }
          }
        }
      });

      if (dissolveProgress > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';

        // Fast global fade to make the dissolve feel snappy.
        ctx.fillStyle = `rgba(0, 0, 0, ${0.26 * dissolveProgress})`;
        ctx.fillRect(
          originX - radiusY * tileW,
          originY - radiusX * tileH,
          radiusY * tileW * 2,
          radiusX * tileH * 2
        );

        // Deterministic speckle erase for a dissolve effect instead of a plain fade.
        const particleCount = Math.floor(2400 * dissolveProgress);
        const timeSeed = Math.floor(time * 220);
        for (let i = 0; i < particleCount; i++) {
          const rx = hash(i * 3.17 + timeSeed * 0.1, i * 7.91);
          const ry = hash(i * 5.11, i * 2.73 + timeSeed * 0.07);
          const px = originX + (rx * 2 - 1) * radiusY * tileW * 0.9;
          const py = originY + (ry * 2 - 1) * radiusX * tileH * 0.84;
          const pr = 0.7 + hash(i * 1.3, i * 9.2) * 2.4;

          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      ctx.restore();

      time += 0.008;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
