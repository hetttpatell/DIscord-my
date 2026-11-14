import React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '../lib/utils';

export function Avatar({ className, src, alt, fallback, color, ...props }) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 select-none',
        className
      )}
      {...props}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt={alt || ''}
          className="aspect-square h-full w-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        className="flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white uppercase"
        style={{ backgroundColor: color || '#FF9F1C' }}
      >
        {fallback || (alt ? alt.slice(0, 2) : '??')}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export default Avatar;

