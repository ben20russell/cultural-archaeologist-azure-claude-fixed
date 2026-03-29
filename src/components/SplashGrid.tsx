import React, { useEffect, useRef } from 'react';

const BUILDING_BASE_WIDTH = 60;
const BUILDING_MAX_HEIGHT = 200;
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

    // Generate building heights deterministically based on position
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
      const baselineY = window.innerHeight - 80;

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

      ctx.globalAlpha = cityVisibility;

      // Draw front-facing cityscape tiled across the page
      const buildingWidth = BUILDING_BASE_WIDTH;
      const numTiles = Math.ceil(window.innerWidth / buildingWidth) + 2;

      for (let tileIdx = -1; tileIdx < numTiles; tileIdx++) {
        const tileStartX = tileIdx * buildingWidth;
        const buildingsPerTile = 4;

        for (let buildingIdx = 0; buildingIdx < buildingsPerTile; buildingIdx++) {
          const buildingId = tileIdx * 100 + buildingIdx;
          const buildingX = tileStartX + (buildingIdx * buildingWidth) / buildingsPerTile;
          const buildingW = buildingWidth / buildingsPerTile - 2;

          // Deterministic height based on building ID
          const heightHash = hash(buildingId, 0);
          const baseHeight = 60 + heightHash * BUILDING_MAX_HEIGHT;
          const animatedHeight = baseHeight * heightScale;
          const currentHeight = baseHeight + (Math.sin(time * 0.8 + buildingId) * 8) * (1 - flattenProgressRef.current);

          // District coloring
          const districtHash = hash(buildingId, 1);
          let fillColor: string;

          if (districtHash < 0.3) {
            // Commercial - blues
            const hue = 200 + districtHash * 40;
            fillColor = `hsl(${hue}, 65%, ${50 + districtHash * 20}%)`;
          } else if (districtHash < 0.6) {
            // Residential - grays
            fillColor = `hsl(0, 0%, ${45 + districtHash * 25}%)`;
          } else {
            // Industrial - oranges
            const hue = 30 + (districtHash - 0.6) * 30;
            fillColor = `hsl(${hue}, 60%, ${48 + (districtHash - 0.6) * 20}%)`;
          }

          // Draw building facade
          ctx.fillStyle = fillColor;
          ctx.fillRect(buildingX, baselineY - currentHeight, buildingW, currentHeight);

          // Add building details (windows)
          const windowSize = Math.max(2, buildingW / 5);
          const windowSpacingX = windowSize + 2;
          const windowSpacingY = windowSize + 2;
          ctx.fillStyle = `hsla(45, 100%, 70%, ${0.6 + Math.sin(time * 2 + buildingId) * 0.2})`;

          for (let wy = 0; wy < currentHeight; wy += windowSpacingY) {
            for (let wx = 0; wx < buildingW; wx += windowSpacingX) {
              if (hash(buildingId + wx / 10, wy / 10) > 0.3) {
                ctx.fillRect(buildingX + wx + 1, baselineY - currentHeight + wy + 1, windowSize - 2, windowSize - 2);
              }
            }
          }

          // Building shadow
          ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * heightScale})`;
          ctx.fillRect(buildingX, baselineY, buildingW, 3);
        }
      }

      // Dissolve effect
      if (dissolveProgress > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * dissolveProgress})`;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.restore();
      }

      time += 0.016;
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
