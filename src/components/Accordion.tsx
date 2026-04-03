import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type AccordionItem = {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
};

type AccordionProps = {
  items: AccordionItem[];
  defaultOpenFirst?: boolean;
  className?: string;
};

export function Accordion({ items, defaultOpenFirst = true, className = '' }: AccordionProps) {
  const safeItems = useMemo(() => items.filter((item) => item && item.id), [items]);
  const [openId, setOpenId] = useState<string | null>(defaultOpenFirst && safeItems[0] ? safeItems[0].id : null);

  if (safeItems.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      {safeItems.map((item) => {
        const domSafeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '-');
        const panelId = `accordion-panel-${domSafeId}`;
        const triggerId = `accordion-trigger-${domSafeId}`;
        const isOpen = openId === item.id;

        return (
          <section key={item.id} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            <h4>
              <button
                id={triggerId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
                className="w-full px-4 py-3 text-left flex items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold text-zinc-900 flex items-center gap-2">{item.title}</span>
                <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            </h4>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!isOpen}
              className="px-4 pb-4"
            >
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}