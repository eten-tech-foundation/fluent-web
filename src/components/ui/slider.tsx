import * as React from 'react';

import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/ui/utils';

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  trackChildren?: React.ReactNode;
  thumbProps?: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb>;
};

/** Single-thumb shadcn-style slider using the same Radix primitives as the other controls. */
const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, trackChildren, thumbProps, ...props }, ref) => (
    <SliderPrimitive.Root
      className={cn(
        'relative flex h-10 w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
      ref={ref}
    >
      <SliderPrimitive.Track className='bg-muted relative h-1 w-full grow rounded-full'>
        <SliderPrimitive.Range className='bg-primary/30 absolute h-full rounded-full' />
        {trackChildren}
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className='bg-primary border-background ring-offset-background focus-visible:ring-ring block size-3 rounded-full border shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none'
        {...thumbProps}
      />
    </SliderPrimitive.Root>
  )
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
