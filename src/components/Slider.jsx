import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../lib/utils';

export function Slider({
  className,
  value,
  defaultValue = [0],
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  disabled = false,
  ...props
}) {
  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex w-full touch-none select-none items-center cursor-pointer py-2',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className
      )}
      min={min}
      max={max}
      step={step}
      value={value !== undefined ? (Array.isArray(value) ? value : [value]) : undefined}
      defaultValue={defaultValue}
      onValueChange={(val) => onValueChange?.(val)}
      disabled={disabled}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10">
        <SliderPrimitive.Range className="absolute h-full bg-[#FF9F1C] transition-all" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-4 w-4 rounded-full border-2 border-white bg-[#FF9F1C] shadow-md transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F1C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B10] hover:scale-110 active:scale-125"
        aria-label="Slider"
      />
    </SliderPrimitive.Root>
  );
}

export default Slider;

