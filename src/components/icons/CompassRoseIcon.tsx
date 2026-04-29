import React from 'react';

interface CompassRoseIconProps {
  className?: string;
}

export const CompassRoseIcon: React.FC<CompassRoseIconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
    <path
      d="M2.8 11.2C2.3 11.4 2.3 12.2 2.8 12.4L10.8 15.4L13.7 22C13.9 22.5 14.7 22.5 14.9 22L21.6 4.6C21.8 4.1 21.3 3.6 20.8 3.8L2.8 11.2Z"
      fill="currentColor"
    />
    <path
      d="M20.8 3.8L10.8 15.4L2.8 12.4L20.8 3.8Z"
      fill="white"
      opacity="0.28"
    />
  </svg>
);
