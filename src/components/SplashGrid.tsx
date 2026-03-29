import React, { useEffect, useRef } from 'react';

type CarAnimationState = {
  axis: 'x' | 'y';
  fixed: number;
  direction: 1 | -1;
  startTime: number;
  durationMs: number;
};

const TILE_W = 44;
const TILE_H = 22;
const ROAD_INTERVAL = 6;
const CAR_ROUTE_LIMIT = 18;

export function SplashGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef({ originX: 0, originY: 0, cityScale: 1 });
  const carRef = useRef<CarAnimationState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const iso = (x: number, y: number, z: number, tileW: number, tileH: number, originX: number, originY: number) => ({
      x: originX + (x - y) * (tileW * 0.5),
      y: originY + (x + y) * (tileH * 0.5) - z,
    });

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
    const nearestMultiple = (value: number, step: number) => Math.round(value / step) * step;

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

    const handleCanvasClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      const { originX, originY, cityScale } = transformRef.current;
      const localX = originX + (sx - originX) / cityScale;
      const localY = originY + (sy - originY) / cityScale;

      const u = (localX - originX) / (TILE_W * 0.5);
      const v = (localY - originY) / (TILE_H * 0.5);
      const gridX = (u + v) * 0.5;
      const gridY = (v - u) * 0.5;

      const nearestXRoad = nearestMultiple(gridX, ROAD_INTERVAL);
      const nearestYRoad = nearestMultiple(gridY, ROAD_INTERVAL);
      const axis: 'x' | 'y' = Math.abs(gridX - nearestXRoad) < Math.abs(gridY - nearestYRoad) ? 'x' : 'y';
      const fixed = clamp(axis === 'x' ? nearestXRoad : nearestYRoad, -CAR_ROUTE_LIMIT, CAR_ROUTE_LIMIT);

      carRef.current = {
        axis,
        fixed,
        direction: Math.random() > 0.5 ? 1 : -1,
        startTime: performance.now(),
        durationMs: 4700,
      };
    };

    canvas.addEventListener('click', handleCanvasClick);

    const drawFuchsiaBall = (
      center: { x: number; y: number },
      night: number,
      tileH: number,
    ) => {
      const radius = tileH * 0.55;

      // Soft drop shadow to anchor the ball to the road.
      ctx.fillStyle = `rgba(20, 16, 16, ${0.22 + night * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + radius * 0.75, radius * 0.9, radius * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();

      const ballGradient = ctx.createRadialGradient(
        center.x - radius * 0.32,
        center.y - radius * 0.48,
        radius * 0.18,
        center.x,
        center.y,
        radius
      );
      ballGradient.addColorStop(0, `hsla(312, 100%, ${82 - night * 6}%, 0.98)`);
      ballGradient.addColorStop(0.45, `hsla(320, 92%, ${58 - night * 7}%, 0.98)`);
      ballGradient.addColorStop(1, `hsla(328, 84%, ${36 - night * 7}%, 0.98)`);

      ctx.fillStyle = ballGradient;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight for a glossy red sphere look.
      ctx.fillStyle = `rgba(255, 248, 248, ${0.78 - night * 0.2})`;
      ctx.beginPath();
      ctx.arc(center.x - radius * 0.34, center.y - radius * 0.34, radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
    };

    const render = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const tileW = TILE_W;
      const tileH = TILE_H;
      const radius = 24;
      const originX = window.innerWidth * 0.5;
      const originY = window.innerHeight * 0.5 + 40;
      const cityScale = 0.7;
      const night = 0;
      const colorCycle = 0;
      const hueShift = 0;
      const pulseLift = 0;
      const accentHue = 306 + hueShift * 0.6;

      transformRef.current = { originX, originY, cityScale };

      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(cityScale, cityScale);
      ctx.translate(-originX, -originY);

      const cells: Array<{ x: number; y: number }> = [];
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          cells.push({ x, y });
        }
      }

      cells.sort((a, b) => (a.x + a.y) - (b.x + b.y));

      const landmarks = [
        { x: -2, y: 1 },
        { x: 3, y: -3 },
        { x: -6, y: -2 },
      ];

      cells.forEach(({ x, y }) => {
        const base = iso(x, y, 0, tileW, tileH, originX, originY);
        const top = { x: base.x, y: base.y - tileH * 0.5 };
        const right = { x: base.x + tileW * 0.5, y: base.y };
        const bottom = { x: base.x, y: base.y + tileH * 0.5 };
        const left = { x: base.x - tileW * 0.5, y: base.y };

        const edgeDistance = Math.hypot(x, y);
        const outsideCity = edgeDistance > radius * 0.86;
        const arterialRoad = x % ROAD_INTERVAL === 0 || y % ROAD_INTERVAL === 0;
        const avenueRoad = x % 3 === 0 || y % 3 === 0;
        const road = arterialRoad || avenueRoad;
        const water = Math.abs(y - x * 0.28 + 1.8) < 0.92;
        const rail = !water && Math.abs(y + x * 0.24 - 3.2) < 0.34;
        const renderRoad = road && !outsideCity;
        const bridge = water && renderRoad;

        const downtown = Math.max(0, 1 - Math.hypot(x + 1, y - 1) / (radius * 0.9));
        const midtown = Math.max(0, 1 - Math.hypot(x - 7, y + 6) / (radius * 1.2));
        const zoneCenter = Math.max(downtown, midtown * 0.72);

        let district: 'residential' | 'commercial' | 'industrial' = 'residential';
        if (zoneCenter > 0.62 || hash(x * 2 + 7, y * 2 - 5) > 0.93) {
          district = 'commercial';
        } else if (hash(x - 6, y + 4) > 0.78) {
          district = 'industrial';
        }

        const plaza = !renderRoad && !water && district === 'commercial' && hash(x * 4, y * 3) > 0.84;
        const park = !renderRoad && !water && !plaza && district !== 'industrial' && hash(x + 3, y - 8) > 0.9;
        const districtHue = 210 + ((x + y + 60) % 8) * 4 + hueShift;

        if (outsideCity && !water) {
          return;
        }

        if (water && !bridge) {
          const canal = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
          canal.addColorStop(0, `hsla(${districtHue + 26}, ${62 + colorCycle * 14}%, ${60 - night * 18 + pulseLift * 0.35}%, 0.72)`);
          canal.addColorStop(1, `hsla(${districtHue + 18}, ${72 + colorCycle * 12}%, ${38 - night * 12 + pulseLift * 0.25}%, 0.72)`);
          drawPoly([top, right, bottom, left], canal);

          if (hash(x + 13, y - 11) > 0.78) {
            drawPoly(
              [
                { x: top.x - tileW * 0.05, y: top.y + tileH * 0.2 },
                { x: top.x + tileW * 0.07, y: top.y + tileH * 0.16 },
                { x: top.x + tileW * 0.12, y: top.y + tileH * 0.27 },
                { x: top.x, y: top.y + tileH * 0.31 },
              ],
              `hsla(${accentHue}, 86%, 70%, 0.44)`
            );
          }
          return;
        }

        if (rail && !renderRoad) {
          drawPoly([top, right, bottom, left], `hsla(${districtHue - 5}, ${12 + colorCycle * 10}%, ${46 - night * 16 + pulseLift * 0.3}%, 0.72)`);
          drawPoly(
            [
              { x: left.x + tileW * 0.16, y: left.y - tileH * 0.1 },
              { x: right.x - tileW * 0.16, y: right.y - tileH * 0.1 },
              { x: right.x - tileW * 0.22, y: right.y - tileH * 0.03 },
              { x: left.x + tileW * 0.22, y: left.y - tileH * 0.03 },
            ],
            `hsla(${districtHue + 2}, 18%, ${62 - night * 18}%, 0.58)`
          );
          drawPoly(
            [
              { x: left.x + tileW * 0.16, y: left.y + tileH * 0.03 },
              { x: right.x - tileW * 0.16, y: right.y + tileH * 0.03 },
              { x: right.x - tileW * 0.22, y: right.y + tileH * 0.1 },
              { x: left.x + tileW * 0.22, y: left.y + tileH * 0.1 },
            ],
            `hsla(${districtHue + 2}, 16%, ${56 - night * 16}%, 0.56)`
          );

          const trainT = (Math.sin(time * 1.1 + x * 0.28 - y * 0.33) + 1) * 0.5;
          const trainX = left.x + (right.x - left.x) * trainT;
          const trainY = left.y + (right.y - left.y) * trainT;
          ctx.fillStyle = `hsla(${accentHue}, 90%, 74%, 0.72)`;
          ctx.beginPath();
          ctx.arc(trainX, trainY, 1.8, 0, Math.PI * 2);
          ctx.fill();
          return;
        }

        if (renderRoad) {
          const roadFill = bridge
            ? `hsla(${districtHue - 2}, ${12 + colorCycle * 9}%, ${42 - night * 14 + pulseLift * 0.3}%, 0.88)`
            : arterialRoad
              ? `hsla(${districtHue - 10}, ${14 + colorCycle * 10}%, ${33 - night * 10 + pulseLift * 0.25}%, 0.92)`
              : `hsla(${districtHue - 6}, ${11 + colorCycle * 8}%, ${39 - night * 12 + pulseLift * 0.25}%, 0.88)`;
          drawPoly([top, right, bottom, left], roadFill);

          if (arterialRoad) {
            drawPoly(
              [
                { x: top.x, y: top.y + tileH * 0.19 },
                { x: right.x - tileW * 0.2, y: right.y },
                { x: bottom.x, y: bottom.y - tileH * 0.19 },
                { x: left.x + tileW * 0.2, y: left.y },
              ],
              `hsla(${districtHue + 4}, 14%, ${55 - night * 18}%, 0.28)`
            );

            for (let k = 0; k < 3; k++) {
              const frac = (k + 1) / 4;
              drawPoly(
                [
                  { x: left.x + (right.x - left.x) * (frac - 0.05), y: left.y + (right.y - left.y) * (frac - 0.05) - tileH * 0.015 },
                  { x: left.x + (right.x - left.x) * frac, y: left.y + (right.y - left.y) * frac - tileH * 0.035 },
                  { x: left.x + (right.x - left.x) * (frac + 0.05), y: left.y + (right.y - left.y) * (frac + 0.05) - tileH * 0.015 },
                  { x: left.x + (right.x - left.x) * frac, y: left.y + (right.y - left.y) * frac + tileH * 0.005 },
                ],
                `hsla(${districtHue + 16}, 24%, 74%, 0.24)`
              );
            }
          }

          const t = (Math.sin(time * (arterialRoad ? 2.6 : 2.1) + (x * 0.72 + y * 0.33)) + 1) * 0.5;
          const car1 = { x: left.x + (right.x - left.x) * t, y: left.y + (right.y - left.y) * t };
          const car2 = { x: top.x + (bottom.x - top.x) * (1 - t), y: top.y + (bottom.y - top.y) * (1 - t) };

          ctx.fillStyle = `hsla(${districtHue + 30}, 92%, 86%, 0.76)`;
          ctx.beginPath();
          ctx.arc(car1.x, car1.y, 1.6, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `hsla(${accentHue}, 92%, 72%, 0.74)`;
          ctx.beginPath();
          ctx.arc(car2.x, car2.y, 1.45, 0, Math.PI * 2);
          ctx.fill();

          if (x % ROAD_INTERVAL === 0 && y % ROAD_INTERVAL === 0) {
            ctx.fillStyle = `hsla(${districtHue + 26}, 78%, 82%, 0.36)`;
            ctx.beginPath();
            ctx.arc(top.x, top.y + tileH * 0.22, 1.45, 0, Math.PI * 2);
            ctx.fill();
          }
          return;
        }

        if (park) {
          drawPoly([top, right, bottom, left], `hsla(${districtHue - 42}, ${30 + colorCycle * 14}%, ${66 - night * 20 + pulseLift * 0.35}%, 0.7)`);
          const trees = 2 + Math.floor(hash(x + 5, y - 2) * 3);
          for (let i = 0; i < trees; i++) {
            const tx = left.x + (i + 1) * (right.x - left.x) / (trees + 1);
            const ty = top.y + tileH * 0.22 + (i % 2) * 2;
            ctx.fillStyle = `hsla(${districtHue - 36}, 44%, ${Math.max(14, 34 + i * 5 - night * 16)}%, 0.74)`;
            ctx.beginPath();
            ctx.arc(tx, ty, 2.3, 0, Math.PI * 2);
            ctx.fill();
          }
          return;
        }

        if (plaza) {
          drawPoly([top, right, bottom, left], `hsla(${districtHue + 8}, ${14 + colorCycle * 10}%, ${76 - night * 18 + pulseLift * 0.25}%, 0.74)`);
          drawPoly(
            [
              { x: top.x - tileW * 0.08, y: top.y + tileH * 0.2 },
              { x: top.x + tileW * 0.02, y: top.y + tileH * 0.16 },
              { x: top.x + tileW * 0.08, y: top.y + tileH * 0.28 },
              { x: top.x - tileW * 0.02, y: top.y + tileH * 0.32 },
            ],
            `hsla(${accentHue}, 52%, 74%, 0.24)`
          );
          return;
        }

        let landmarkDistance = 999;
        for (let i = 0; i < landmarks.length; i++) {
          const d = Math.hypot(x - landmarks[i].x, y - landmarks[i].y);
          if (d < landmarkDistance) landmarkDistance = d;
        }

        const isLandmark = landmarkDistance < 0.1;
        const inLandmarkRing = landmarkDistance < 2.5;
        const districtBoost = district === 'commercial' ? 54 : district === 'industrial' ? 18 : 0;
        const contextScale = inLandmarkRing && !isLandmark ? 0.7 : 1;
        const baseHeight = (20 + zoneCenter * 118 + districtBoost + hash(x * 3, y * 2) * 20) * contextScale;
        const h = isLandmark ? baseHeight * 1.52 : baseHeight;

        const spread = district === 'commercial' ? 0.84 : district === 'industrial' ? 0.79 : 0.7;
        const footprint = spread - hash(x + 9, y - 4) * 0.1;

        const topPt = iso(x, y, h, tileW * footprint, tileH * footprint, originX, originY);
        const n = { x: topPt.x, y: topPt.y - (tileH * footprint) * 0.5 };
        const e = { x: topPt.x + (tileW * footprint) * 0.5, y: topPt.y };
        const s = { x: topPt.x, y: topPt.y + (tileH * footprint) * 0.5 };
        const w = { x: topPt.x - (tileW * footprint) * 0.5, y: topPt.y };

        const basePt = iso(x, y, 0, tileW * footprint, tileH * footprint, originX, originY);
        const be = { x: basePt.x + (tileW * footprint) * 0.5, y: basePt.y };
        const bs = { x: basePt.x, y: basePt.y + (tileH * footprint) * 0.5 };
        const bw = { x: basePt.x - (tileW * footprint) * 0.5, y: basePt.y };

        drawPoly(
          [
            { x: bw.x + tileW * 0.08, y: bw.y + tileH * 0.25 },
            { x: bs.x + tileW * 0.18, y: bs.y + tileH * 0.2 },
            { x: bs.x + tileW * 0.34, y: bs.y + tileH * 0.28 },
            { x: bw.x + tileW * 0.24, y: bw.y + tileH * 0.34 },
          ],
          `rgba(15,20,34,${0.14 + night * 0.16})`
        );

        const sideEast = district === 'commercial'
          ? `hsla(${districtHue + 6}, ${56 + colorCycle * 12}%, ${42 - night * 17 + pulseLift * 0.2}%, 0.9)`
          : district === 'industrial'
            ? `hsla(${districtHue + 2}, ${32 + colorCycle * 10}%, ${40 - night * 14 + pulseLift * 0.2}%, 0.9)`
            : `hsla(${districtHue + 2}, ${46 + colorCycle * 10}%, ${44 - night * 16 + pulseLift * 0.2}%, 0.88)`;

        const sideWest = district === 'commercial'
          ? `hsla(${districtHue - 2}, ${46 + colorCycle * 10}%, ${30 - night * 12 + pulseLift * 0.15}%, 0.92)`
          : district === 'industrial'
            ? `hsla(${districtHue - 4}, ${22 + colorCycle * 8}%, ${30 - night * 10 + pulseLift * 0.15}%, 0.92)`
            : `hsla(${districtHue - 4}, ${34 + colorCycle * 8}%, ${34 - night * 12 + pulseLift * 0.15}%, 0.9)`;

        const roofColor = district === 'commercial'
          ? `hsla(${districtHue + 18}, ${78 + colorCycle * 10}%, ${78 - night * 28 + pulseLift * 0.22}%, 0.94)`
          : district === 'industrial'
            ? `hsla(${districtHue + 10}, ${34 + colorCycle * 10}%, ${64 - night * 22 + pulseLift * 0.22}%, 0.9)`
            : `hsla(${districtHue + 14}, ${56 + colorCycle * 10}%, ${74 - night * 24 + pulseLift * 0.22}%, 0.92)`;

        drawPoly([e, s, bs, be], sideEast);
        drawPoly([w, s, bs, bw], sideWest);
        drawPoly([n, e, s, w], roofColor);

        if (district === 'commercial' && !isLandmark && hash(x - 8, y + 9) > 0.8) {
          drawPoly(
            [
              { x: n.x - tileW * footprint * 0.13, y: n.y + tileH * footprint * 0.24 },
              { x: n.x + tileW * footprint * 0.03, y: n.y + tileH * footprint * 0.16 },
              { x: n.x + tileW * footprint * 0.1, y: n.y + tileH * footprint * 0.27 },
              { x: n.x - tileW * footprint * 0.06, y: n.y + tileH * footprint * 0.34 },
            ],
            `hsla(${accentHue}, 76%, 66%, 0.42)`
          );
        }

        if (isLandmark) {
          drawPoly(
            [
              { x: n.x - tileW * footprint * 0.09, y: n.y + tileH * footprint * 0.16 },
              { x: n.x + tileW * footprint * 0.03, y: n.y + tileH * footprint * 0.1 },
              { x: n.x + tileW * footprint * 0.03, y: n.y - 28 },
              { x: n.x - tileW * footprint * 0.09, y: n.y - 22 },
            ],
            `hsla(${districtHue + 22}, 42%, 24%, 0.84)`
          );

          drawPoly(
            [
              { x: n.x - tileW * footprint * 0.03, y: n.y - 24 },
              { x: n.x + tileW * footprint * 0.06, y: n.y - 28 },
              { x: n.x + tileW * footprint * 0.11, y: n.y - 20 },
              { x: n.x + tileW * footprint * 0.02, y: n.y - 16 },
            ],
            `hsla(${accentHue}, 72%, 68%, 0.54)`
          );
        }
      });

      const activeCar = carRef.current;
      if (activeCar) {
        const elapsed = performance.now() - activeCar.startTime;
        const progress = elapsed / activeCar.durationMs;

        if (progress >= 1) {
          carRef.current = null;
        } else {
          const p = clamp(progress, 0, 1);
          const travel = (p * 2 - 1) * 19 * activeCar.direction;

          const gridCarX = activeCar.axis === 'y' ? travel : activeCar.fixed;
          const gridCarY = activeCar.axis === 'x' ? travel : activeCar.fixed;
          const center = iso(gridCarX, gridCarY, 2, tileW, tileH, originX, originY);

          drawFuchsiaBall(center, night, tileH);
        }
      }

      // Keep daytime lift, but fade it at night.
      ctx.fillStyle = `rgba(255, 255, 255, ${0.2 * (1 - night)})`;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

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
