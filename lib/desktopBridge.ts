// lib/desktopBridge.ts
export const isElectron =
  typeof window !== "undefined" &&
  typeof (window as any).zulipDesktop !== "undefined";

export const desktop = isElectron ? (window as any).zulipDesktop : null as any;
