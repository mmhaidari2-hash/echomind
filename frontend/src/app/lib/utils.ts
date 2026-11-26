import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn() — the shadcn/ui class merger (clsx + tailwind-merge).
 * Same helper every shadcn/ui project uses; kept here so the ui/
 * components below are the real shadcn components, not lookalikes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
