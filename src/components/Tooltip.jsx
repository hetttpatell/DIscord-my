import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../lib/utils';

export function TooltipProvider({ children, delayDuration = 200, ...props }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({ children, content, side = 'top', className }) {
  if (!content) return children;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 overflow-hidden rounded-lg bg-[#1C1C24] border border-white/10 px-3 py-1.5 text-xs text-[#F4F1EA] shadow-xl animate-fade-in select-none',
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[#1C1C24]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export default Tooltip;

