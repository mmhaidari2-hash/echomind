import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/app/lib/utils";

/**
 * Button — the shadcn/ui Button (new-york style), restyled for the
 * EchoMind warm palette: dark-brown primary (like SparkFlow's pill
 * buttons), amber outline, cream secondary. Same API as shadcn/ui, so
 * any shadcn pattern from the repo works here unchanged.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-bark text-cream shadow-[0_10px_24px_-8px_rgba(43,29,18,0.55)] hover:bg-bark-soft",
        secondary:
          "bg-white/70 text-bark border border-bark/15 shadow-sm hover:bg-white",
        outline:
          "border border-honey/60 bg-transparent text-bark hover:bg-honey/10",
        ghost: "text-bark hover:bg-bark/5",
        destructive:
          "bg-red-700/90 text-red-50 hover:bg-red-700",
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
