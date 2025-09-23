import { ReactNode } from "react";

export function ScrollArea({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const classes = ["min-h-0 overflow-y-auto", className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}

export default ScrollArea;
