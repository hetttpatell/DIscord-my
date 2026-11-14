import React from 'react';
import { Drawer } from 'vaul';
import { cn } from '../lib/utils';

export function Sheet({
  open,
  onOpenChange,
  children,
  trigger,
  title,
  description,
  className,
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 flex max-h-[85dvh] flex-col rounded-t-[20px] bg-[#141419] border-t border-white/10 p-4 focus:outline-none',
            className
          )}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />
          {title && (
            <Drawer.Title className="text-base font-bold text-[#F4F1EA] px-2 mb-1">
              {title}
            </Drawer.Title>
          )}
          {description && (
            <Drawer.Description className="text-xs text-[#9A978F] px-2 mb-3">
              {description}
            </Drawer.Description>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default Sheet;

