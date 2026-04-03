import React from 'react';
import { motion } from 'motion/react';

interface CulturalCardProps {
  category: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  colSpan?: number;
  onClick?: () => void;
}

export function CulturalCard({
  category,
  title,
  description,
  icon,
  highlight = false,
  colSpan = 1,
  onClick,
}: CulturalCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4 }}
      className={`group relative overflow-hidden rounded-2xl p-6 backdrop-blur-md transition-all duration-300 ease-out text-left border
        ${colSpan === 2 ? 'col-span-2' : 'col-span-1'}
        ${highlight
          ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-500/60 shadow-lg shadow-amber-500/20'
          : 'bg-white/[0.03] border-white/10 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10'
        }
      `}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 via-transparent to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 font-medium mb-1">
              {category}
            </p>
            <h3 className="text-lg font-serif font-semibold text-zinc-100 tracking-tight group-hover:text-amber-400 transition-colors duration-300">
              {title}
            </h3>
          </div>
          {icon && (
            <div className="shrink-0 text-amber-500/60 group-hover:text-amber-400 transition-colors duration-300">
              {icon}
            </div>
          )}
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">
          {description}
        </p>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-amber-500/0 via-amber-500/50 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-full" />
    </motion.button>
  );
}
