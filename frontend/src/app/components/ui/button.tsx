import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/app/lib/utils";

/**
 * Button — the shadcn/ui Button (new-york style), restyled for the
 * EchoMind Dark Obsidian palette: gold primary (dark text on gold),
 * gold outline, dark glass secondary. Same API as shadcn/ui, so
 * any shadcn pattern from the repo works here unchanged.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gold text-obsidian shadow-cta hover:bg-gold-light",
        secondary:
          "bg-white/[0.06] text-ink border border-white/[0.09] shadow-sm hover:bg-white/[0.10]",
        outline:
          "border border-gold/60 bg-transparent text-ink hover:bg-gold/10",
        ghost: "text-ink hover:bg-white/[0.06]",
        destructive:
          "bg-red-500/90 text-red-50 hover:bg-red-500",
      },
      size: {
        default: "min-h-11 px-5 py-2.5",
        sm: "min-h-9 px-3.5 py-1.5 text-xs",
        lg: "min-h-12 px-6 py-3 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
