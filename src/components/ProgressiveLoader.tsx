import { useEffect, useMemo, useState } from 'react';

type ProgressiveLoaderProps = {
  messages: string[];
  className?: string;
  showProgress?: boolean;
  progress?: number;
  /**
   * Required: average duration (ms) for the loading process, used to pace the progress bar more realistically
   */
  averageDurationMs: number;
};

export function ProgressiveLoader({
  messages,
  className = '',
  showProgress = false,
  progress = 0,
  averageDurationMs,
}: ProgressiveLoaderProps) {
  const safeMessages = useMemo(() => {
    if (messages.length > 0) {
      return messages;
    }
    return ['Working...'];
  }, [messages]);

  const [messageIndex, setMessageIndex] = useState(0);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [forceComplete, setForceComplete] = useState(false);

  // Animate progress smoothly
  useEffect(() => {
    if (progress >= 100) {
      setDisplayedProgress(100);
      return;
    }
    if (progress > displayedProgress) {
      // Split the animation into 4 quarters based on averageDurationMs
      // Each quarter has a different pace (faster at first, slower at end)
      const percent = displayedProgress;
      let baseInterval = 40;
      let step = 1;
      if (percent < 25) {
        // First quarter: fast
        baseInterval = Math.max(10, averageDurationMs / 100);
        step = 2;
      } else if (percent < 50) {
        // Second quarter: moderate
        baseInterval = Math.max(20, averageDurationMs / 80);
        step = 1.5;
      } else if (percent < 75) {
        // Third quarter: slower
        baseInterval = Math.max(30, averageDurationMs / 60);
        step = 1;
      } else {
        // Last quarter: slowest
        baseInterval = Math.max(40, averageDurationMs / 40);
        step = 0.5;
      }
      // Never overshoot the target progress
      const interval = setInterval(() => {
        setDisplayedProgress((prev) => {
          if (prev >= progress) return prev;
          return Math.min(prev + step, progress);
        });
      }, baseInterval);
      return () => clearInterval(interval);
    } else if (progress < displayedProgress) {
      setDisplayedProgress(progress);
    }
  }, [progress, displayedProgress, averageDurationMs]);

  // Fallback: if stuck at 99% for >5s, force to 100%
  useEffect(() => {
    if (displayedProgress >= 99 && displayedProgress < 100 && !forceComplete) {
      const timer = setTimeout(() => {
        setDisplayedProgress(100);
        setForceComplete(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
    if (displayedProgress === 100 && forceComplete) {
      // Reset forceComplete for next load
      setTimeout(() => setForceComplete(false), 1000);
    }
  }, [displayedProgress, forceComplete]);

  useEffect(() => {
    setMessageIndex(0);
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % safeMessages.length);
    }, 2000);
    return () => {
      clearInterval(interval);
    };
  }, [safeMessages]);

  const currentMessage = safeMessages[messageIndex];

  return (
    <span className={`inline-flex flex-col items-center gap-1 ${className}`.trim()}>
      <span className="flex items-center gap-2">
        <span>{currentMessage}</span>
        {showProgress && <span className="tabular-nums font-mono relative">{Math.round(displayedProgress)}%</span>}
      </span>
      {showProgress && (
        <span className="block w-full h-1 rounded-full bg-white/20 relative mt-1 min-w-[64px]">
          <span
            className="block h-full rounded-full bg-fuchsia-400 transition-all duration-200"
            style={{ width: `${displayedProgress}%` }}
          />
        </span>
      )}
    </span>
  );
}
