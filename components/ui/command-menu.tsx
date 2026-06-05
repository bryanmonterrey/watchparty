"use client";
 
import * as React from 'react';
import { type DialogProps } from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { tv, type VariantProps } from 'tailwind-variants';
 
import * as Dialog from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X } from 'lucide-react';

// Simple polymorphic type for icons and other flexible elements
type PolymorphicComponentProps<T extends React.ElementType, Props = {}> = {
  as?: T;
} & React.ComponentPropsWithoutRef<T> & Props;
 
const CommandDialogTitle = Dialog.DialogTitle;
const CommandDialogDescription = Dialog.DialogDescription;
 
const CommandDialog = ({
  children,
  className,
  overlayClassName,
  ...rest
}: DialogProps & {
  className?: string;
  overlayClassName?: string;
}) => {
  return (
    <Dialog.Dialog {...rest}>
      <Dialog.DialogContent
        showCloseButton={false}
        className={cn(
          'flex max-h-[85vh] w-full max-w-[900px] sm:max-w-[725px] flex-col overflow-hidden rounded-[24px] p-0 gap-0',
          'bg-zinc-950 backdrop-blur-xl border-zinc-800/50 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_32px_64px_-16px_rgba(0,0,0,0.5)]',
          className,
        )}
      >
        <VisuallyHidden>
            <CommandDialogTitle>Search Command Menu</CommandDialogTitle>
            <CommandDialogDescription>Search for tokens, users, or streams across the platform.</CommandDialogDescription>
        </VisuallyHidden>
        <motion.div
           initial={{ opacity: 0, scale: 0.98, y: 10 }}
           animate={{ opacity: 1, scale: 1, y: 0 }}
           transition={{ type: "spring", stiffness: 400, damping: 30 }}
           className="flex flex-col flex-1 min-h-0"
        >
            <Command
            shouldFilter={false}
            className={cn(
                'divide-y divide-zinc-800/50',
                'grid min-h-0 auto-cols-auto grid-flow-row',
                '[&>[cmdk-label]+*]:!border-t-0',
            )}
            >
            {children}
            </Command>
        </motion.div>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  );
};
 
const CommandInput = React.forwardRef<
  React.ComponentRef<typeof Command.Input>,
  React.ComponentPropsWithoutRef<typeof Command.Input>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <div className="flex items-center px-6 py-5 gap-4 bg-transparent border-b border-zinc-800/50" cmdk-input-wrapper="">
      <Search className="size-6 text-zinc-500 shrink-0" />
      <Command.Input
        ref={forwardedRef}
        className={cn(
          'flex h-12 w-full rounded-md bg-transparent py-4 text-lg outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50',
          'transition duration-200 ease-out font-medium tracking-tight',
          className,
        )}
        {...rest}
      />
    </div>
  );
});
CommandInput.displayName = 'CommandInput';

const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof Command.Empty>,
  React.ComponentPropsWithoutRef<typeof Command.Empty>
>((props, forwardedRef) => {
  return (
    <Command.Empty
      ref={forwardedRef}
      className="py-14 text-center text-zinc-500"
      {...props}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="size-12 rounded-2xl bg-zinc-900 flex items-center justify-center border border-zinc-800">
           <Search className="size-5 text-zinc-400" />
        </div>
        <p className="text-sm font-medium">No results found.</p>
        <p className="text-xs text-zinc-600">Try searching for something else.</p>
      </div>
    </Command.Empty>
  );
});
CommandEmpty.displayName = 'CommandEmpty';
 
const CommandList = React.forwardRef<
  React.ComponentRef<typeof Command.List>,
  React.ComponentPropsWithoutRef<typeof Command.List>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <Command.List
      ref={forwardedRef}
      className={cn(
        'flex max-h-[450px] min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-3 scrollbar-none',
        className,
      )}
      {...rest}
    />
  );
});
CommandList.displayName = 'CommandList';
 
const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof Command.Group>,
  React.ComponentPropsWithoutRef<typeof Command.Group>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <Command.Group
      ref={forwardedRef}
      className={cn(
        'relative overflow-hidden',
        '[&>[cmdk-group-heading]]:text-[12px] [&>[cmdk-group-heading]]:text-zinc-500',
        '[&>[cmdk-group-heading]]:mb-2 [&>[cmdk-group-heading]]:px-4 [&>[cmdk-group-heading]]:pt-4 [&>[cmdk-group-heading]]:uppercase [&>[cmdk-group-heading]]:tracking-[0.1em] [&>[cmdk-group-heading]]:font-bold',
        className,
      )}
      {...rest}
    />
  );
});
CommandGroup.displayName = 'CommandGroup';
 
const commandItemVariants = tv({
  base: [
    'group flex items-center gap-4 rounded-xl',
    'cursor-pointer text-[16px] text-zinc-400 font-medium',
    'transition duration-150 ease-out outline-none select-none mx-1',
    'data-[selected=true]:bg-zinc-800/80 data-[selected=true]:text-white data-[selected=true]:shadow-sm',
    'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
  ],
  variants: {
    size: {
      small: 'px-4 py-3',
      medium: 'px-4 py-4',
    },
  },
  defaultVariants: {
    size: 'small',
  },
});
 
type CommandItemProps = VariantProps<typeof commandItemVariants> &
  React.ComponentPropsWithoutRef<typeof Command.Item>;
 
const CommandItem = React.forwardRef<
  React.ComponentRef<typeof Command.Item>,
  CommandItemProps
>(({ className, size, ...rest }, forwardedRef) => {
  return (
    <Command.Item
      ref={forwardedRef}
      className={commandItemVariants({ size, class: className })}
      {...rest}
    />
  );
});
CommandItem.displayName = 'CommandItem';
 
function CommandItemIcon<T extends React.ElementType>({
  className,
  as,
  ...rest
}: PolymorphicComponentProps<T>) {
  const Component = as || 'div';
 
  return (
    <Component
      className={cn(
        'size-6 shrink-0 text-zinc-500 transition-colors',
        'group-data-[selected=true]:text-white group-hover:text-white',
        className
      )}
      {...rest}
    />
  );
}
 
function CommandFooter({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex h-14 items-center justify-between gap-3 px-6 border-t border-zinc-900/50 bg-transparent',
        className,
      )}
      {...rest}
    />
  );
}
 
function CommandFooterKeyBox({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-w-[20px] h-6 shrink-0 items-center justify-center rounded-md px-1.5',
        'bg-zinc-900 text-zinc-500 border border-zinc-800 text-[11px] font-bold tracking-tighter',
        className,
      )}
      {...rest}
    />
  );
}

const commandTagVariants = tv({
  base: [
    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer',
    'bg-zinc-900/50 border border-zinc-800/50 text-zinc-400',
    'hover:bg-zinc-800/80 hover:text-white hover:border-zinc-700/50 hover:shadow-sm',
    'data-[active=true]:bg-white data-[active=true]:text-black data-[active=true]:border-white data-[active=true]:shadow-md',
  ],
});

function CommandTag({
  className,
  active,
  children,
  onDismiss,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { active?: boolean; onDismiss?: () => void }) {
  return (
    <div
      className={commandTagVariants({ class: className })}
      data-active={active}
      {...rest}
    >
      {children}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="hover:opacity-70 transition-opacity"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function CommandSubheader({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('text-[12px] font-bold text-zinc-500 uppercase tracking-[0.1em]', className)}
      {...rest}
    />
  );
}

function CommandDivider({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('h-px bg-zinc-800/50 w-full', className)}
      {...rest}
    />
  );
}
 
export {
  CommandDialog as Dialog,
  CommandDialogTitle as DialogTitle,
  CommandDialogDescription as DialogDescription,
  CommandInput as Input,
  CommandList as List,
  CommandEmpty as Empty,
  CommandGroup as Group,
  CommandItem as Item,
  CommandItemIcon as ItemIcon,
  CommandFooter as Footer,
  CommandFooterKeyBox as FooterKeyBox,
  CommandTag as Tag,
  CommandSubheader as Subheader,
  CommandDivider as Divider,
};
