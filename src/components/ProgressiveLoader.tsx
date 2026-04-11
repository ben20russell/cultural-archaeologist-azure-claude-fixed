import { useEffect, useMemo, useState } from 'react';

type ProgressiveLoaderProps = {
  messages: string[];
  className?: string;
  showProgress?: boolean;
  progress?: number;
};

export function ProgressiveLoader({
  messages,
  className = '',
  showProgress = false,
  progress = 0,
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
      const step = () => {
        setDisplayedProgress((prev) => {
          if (prev >= progress) return prev;
          return Math.min(prev + Math.max(1, Math.round((progress - prev) / 8)), progress);
        });
      };
      const interval = setInterval(step, 40);
      return () => clearInterval(interval);
    } else if (progress < displayedProgress) {
      setDisplayedProgress(progress);
    }
  }, [progress, displayedProgress]);

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

  // Find the longest message for min-width reservation
  const longestMessage = useMemo(() => {
    let max = '';
    for (const msg of safeMessages) {
      if (msg.length > max.length) max = msg;
    }
    return max;
  }, [safeMessages]);

  // Add space for progress percentage if shown
  const minWidthText = showProgress ? `${longestMessage} 100%` : longestMessage;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`.trim()} style={{ minWidth: `${minWidthText.length + 2}ch` }}>
      {/* Visually hidden span to reserve space for the longest message */}
      <span aria-hidden="true" className="invisible absolute whitespace-pre pointer-events-none select-none">
        {minWidthText}
      </span>
      <span>{currentMessage}</span>
      {showProgress && <span>{Math.round(displayedProgress)}%</span>}
    </span>
  );
}
