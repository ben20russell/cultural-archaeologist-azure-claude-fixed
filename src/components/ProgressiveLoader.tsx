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
      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-fuchsia-400 animate-pulse" aria-hidden="true" />
      <span>{currentMessage}</span>
      {showProgress && <span>{Math.round(progress)}%</span>}
    </span>
  );
}
