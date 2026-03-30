import { useEffect, useRef } from 'react';

const TILE_W = 44;
const TILE_H = 22;
const CITY_SATURATION_BOOST = 6;
const CITY_LIGHTNESS_SHIFT = 8;

export function SplashGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerXRef = useRef(0.5);
  const pointerYRef = useRef(0.85);
  const pointerActiveRef = useRef(false);
  const pointerInfluenceRef = useRef(0);
  const pointerLiftRef = useRef(0);

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

    const iso = (x: number, y: number, z: number, tileW: number, tileH: number, originX: number, originY: number) => {
      return {
        x: originX + (x - y) * (tileW * 0.5),
        y: originY + (x + y) * (tileH * 0.5) - z,
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

    const setPointerPosition = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerXRef.current = clamp((clientX - rect.left) / rect.width, 0, 1);
      pointerYRef.current = clamp((clientY - rect.top) / rect.height, 0, 1);
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerActiveRef.current = true;
      setPointerPosition(event.clientX, event.clientY);
      if (canvas.setPointerCapture) {
        canvas.setPointerCapture(event.pointerId);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      // Mouse should react on hover; touch/pen react while pressed.
      if (event.pointerType === 'mouse') {
        pointerActiveRef.current = true;
      }
      setPointerPosition(event.clientX, event.clientY);
    };

    const handlePointerUpOrCancel = () => {
      pointerActiveRef.current = false;
    };

    const handlePointerLeave = () => {
      pointerActiveRef.current = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUpOrCancel);
    canvas.addEventListener('pointercancel', handlePointerUpOrCancel);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    const render = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const tileW = TILE_W;
      const tileH = TILE_H;
      const radiusX = Math.ceil(window.innerWidth / (tileW * 0.58));
      const radiusY = 22;
      const originX = window.innerWidth * 0.5;
      // Push the skyline lower so it does not collide with splash headline copy.
      const originY = window.innerHeight + 28;
      const cityScale = 0.7;
      const sat = (value: number) => clamp(value + CITY_SATURATION_BOOST, 0, 100);
      const light = (value: number) => clamp(value + CITY_LIGHTNESS_SHIFT, 0, 100);

      const pointerInfluenceTarget = pointerActiveRef.current ? 1 : 0;
      pointerInfluenceRef.current += (pointerInfluenceTarget - pointerInfluenceRef.current) * 0.24;
      const pointerLiftTarget = pointerActiveRef.current
        ? clamp((1 - pointerYRef.current) * 2.2 - 0.2, -0.4, 1.85)
        : 0;
      pointerLiftRef.current += (pointerLiftTarget - pointerLiftRef.current) * 0.22;
      const pointerX = pointerXRef.current * window.innerWidth;
      const pointerY = pointerYRef.current * window.innerHeight;
      const pointerSigmaX = window.innerWidth * 0.14;
      const pointerSigmaY = window.innerHeight * 0.18;

      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(cityScale, cityScale);
      ctx.translate(-originX, -originY);

      const cells: Array<{ x: number; y: number }> = [];
      for (let y = -radiusY; y <= radiusY; y++) {
        for (let x = -radiusX; x <= radiusX; x++) {
          cells.push({ x, y });
        }
      }

      cells.sort((a, b) => a.x - b.x || a.y - b.y);

      cells.forEach(({ x, y }) => {
        if (Math.abs(y) > radiusY * 0.97) return;

        const base = iso(x, y, 0, tileW, tileH, originX, originY);

        const water = Math.abs(y - x * 0.24 + 1.5) < 0.9;
        if (water) {
          // Skip rendering base surfaces to keep the city floating without gray road planes.
          return;
        }

        const downtown = Math.max(0, 1 - Math.hypot(x + 3, y - 2) / (radiusY * 0.55));
        const midtown = Math.max(0, 1 - Math.hypot(x - 8, y + 5) / (radiusY * 0.9));
        const density = Math.max(downtown, midtown * 0.74);

        const distX = base.x - pointerX;
        const distY = base.y - pointerY;
        const weightX = Math.exp(-(distX * distX) / (2 * pointerSigmaX * pointerSigmaX));
        const weightY = Math.exp(-(distY * distY) / (2 * pointerSigmaY * pointerSigmaY));
        const localWeight = weightX * weightY;
        const pointerLift = pointerLiftRef.current * pointerInfluenceRef.current * localWeight;

        const baseHeight = 28 + density * 170 + hash(x * 3.3, y * 2.1) * 40;
        const breathe = 1 + Math.sin(time * 1.25 + hash(x * 0.6, y * 0.7) * Math.PI * 2) * 0.045;
        const interactiveScale = clamp(1 + pointerLift * 2.25, 0.28, 3.7);
        const height = baseHeight * breathe * interactiveScale;

        const footprint = 0.68 + hash(x * 0.93 - 8, y * 1.1 + 3) * 0.18;
        const top = iso(x, y, height, tileW * footprint, tileH * footprint, originX, originY);
        const tn = { x: top.x, y: top.y - (tileH * footprint) * 0.5 };
        const te = { x: top.x + (tileW * footprint) * 0.5, y: top.y };
        const ts = { x: top.x, y: top.y + (tileH * footprint) * 0.5 };
        const tw = { x: top.x - (tileW * footprint) * 0.5, y: top.y };

        const b = iso(x, y, 0, tileW * footprint, tileH * footprint, originX, originY);
        const be = { x: b.x + (tileW * footprint) * 0.5, y: b.y };
        const bs = { x: b.x, y: b.y + (tileH * footprint) * 0.5 };
        const bw = { x: b.x - (tileW * footprint) * 0.5, y: b.y };

        const hue = 252 + ((y + radiusY) / (radiusY * 2)) * 50;
        const topColor = `hsla(${hue + 16}, ${sat(74)}%, ${light(82)}%, 0.95)`;
        const eastColor = `hsla(${hue + 6}, ${sat(62)}%, ${light(60)}%, 0.9)`;
        const westColor = `hsla(${hue - 4}, ${sat(54)}%, ${light(50)}%, 0.92)`;

        drawPoly([te, ts, bs, be], eastColor);
        drawPoly([tw, ts, bs, bw], westColor);
        drawPoly([tn, te, ts, tw], topColor);

        const litChance = 0.24 + density * 0.42;
        const rows = Math.min(8, Math.max(2, Math.floor(height / 28)));
        const cols = 2;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (hash(x * 1.7 + c * 11, y * 1.4 + r * 9) < litChance) {
              const fx = (c + 1) / (cols + 1);
              const fy = (r + 1) / (rows + 1);
              const wx = bw.x + (be.x - bw.x) * fx;
              const wy = bs.y - (height * 0.85) * fy;
              ctx.fillStyle = 'hsla(300, 88%, 78%, 0.65)';
              ctx.fillRect(wx - 1.1, wy - 1.1, 2.2, 2.2);
            }
          }
        }
      });

      ctx.restore();

      time += 0.008;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUpOrCancel);
      canvas.removeEventListener('pointercancel', handlePointerUpOrCancel);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />;
}
