import * as React from 'react';
import { type VariantProps } from 'class-variance-authority';

import {
  ToggleGroup as ToggleGroupPrimitive,
  ToggleGroupItem as ToggleGroupItemPrimitive,
  ToggleGroupHighlight as ToggleGroupHighlightPrimitive,
  ToggleGroupHighlightItem as ToggleGroupHighlightItemPrimitive,
  useToggleGroup as useToggleGroupPrimitive,
  type ToggleGroupProps as ToggleGroupPrimitiveProps,
  type ToggleGroupItemProps as ToggleGroupItemPrimitiveProps,
} from '@/components/ui/animate-ui/primitives/radix/toggle-group';
import { toggleVariants } from '@/components/ui/animate-ui/components/radix/toggle';
import { cn } from '@/lib/utils';
import { getStrictContext } from '@/lib/get-strict-context';

const [ToggleGroupProvider, useToggleGroup] =
  getStrictContext<VariantProps<typeof toggleVariants>>('ToggleGroupContext');

type ToggleGroupProps = ToggleGroupPrimitiveProps &
  VariantProps<typeof toggleVariants>;

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: ToggleGroupProps) {
  return (
    <ToggleGroupPrimitive
      data-variant={variant}
      data-size={size}
      className={cn(
        'group/toggle-group flex gap-0.5 w-fit items-center p-2 bg-black1/60 rounded-full data-[variant=outline]:shadow-xs data-[variant=outline]:border data-[variant=outline]:border-white/5 data-[variant=outline]:p-0.5',
        className,
      )}
      {...props}
    >
      <ToggleGroupProvider value={{ variant, size }}>
        {props.type === 'single' ? (
          <ToggleGroupHighlightPrimitive className="bg-white/10 rounded-full">
            {children}
          </ToggleGroupHighlightPrimitive>
        ) : (
          children
        )}
      </ToggleGroupProvider>
    </ToggleGroupPrimitive>
  );
}

type ToggleGroupItemProps = ToggleGroupItemPrimitiveProps &
  VariantProps<typeof toggleVariants>;

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: ToggleGroupItemProps) {
  const { variant: contextVariant, size: contextSize } = useToggleGroup();
  const { type } = useToggleGroupPrimitive();

  return (
    <ToggleGroupHighlightItemPrimitive
      value={props.value}
      className={cn(type === 'multiple' && 'bg-white/10 rounded-full')}
    >
      <ToggleGroupItemPrimitive
        data-variant={contextVariant || variant}
        data-size={contextSize || size}
        className={cn(
          toggleVariants({
            variant: contextVariant || variant,
            size: contextSize || size,
          }),
          'min-w-0 border-0 px-3 flex-1 shrink-0 shadow-none rounded-full focus:z-10 focus-visible:z-10',
          className,
        )}
        {...props}
      >
        {children}
      </ToggleGroupItemPrimitive>
    </ToggleGroupHighlightItemPrimitive>
  );
}

export {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupProps,
  type ToggleGroupItemProps,
};
