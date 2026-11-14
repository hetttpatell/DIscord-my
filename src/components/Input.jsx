import React from 'react';
import { cn } from '../lib/utils';

export const Input = React.forwardRef(
  ({ className, type = 'text', disabled = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          'flex h-11 min-h-[44px] w-full rounded-xl bg-[#141419] border border-white/10 px-4 py-2 text-base md:text-sm text-[#F4F1EA] placeholder:text-[#9A978F]/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F1C] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
export default Input;

