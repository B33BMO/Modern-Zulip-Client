import { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium",
        "bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/10",
        "transition focus:outline-none focus:ring-2 focus:ring-white/20",
        className
      )}
      {...props}
    />
  );
}
