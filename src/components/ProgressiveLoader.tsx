import { useEffect, useMemo, useState } from 'react';

type ProgressiveLoaderProps = {
  messages: string[];
  className?: string;
  showProgress?: boolean;
  progress?: number;
  /**
   * Optional: average duration (ms) for the loading process, used to pace the progress bar more realistically
   */
  averageDurationMs?: number;
};

export function ProgressiveLoader({
  messages,
  className = '',
  showProgress = false,
  progress = 0,
  averageDurationMs = 4000,
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
      // Estimate time remaining based on averageDurationMs and current progress
      const remaining = Math.max(progress - displayedProgress, 1);
      // Slow down as we approach 100%
      let baseInterval = 40;
      let slowZone = progress > 85;
      if (slowZone) {
        // In the last 15%, slow down the interval
        baseInterval = 120;
      }
      // Optionally, further slow in the last 3%
      if (progress > 97) {
        baseInterval = 250;
      }
      // Optionally, use averageDurationMs to pace the increments
      const estimatedStep = Math.max(1, Math.round((progress - displayedProgress) / 8));
      const interval = setInterval(() => {
        setDisplayedProgress((prev) => {
          if (prev >= progress) return prev;
          return Math.min(prev + estimatedStep, progress);
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
    <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <span>{currentMessage}</span>
      {showProgress && <span>{Math.round(displayedProgress)}%</span>}
    </span>
  );
}
