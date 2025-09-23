export function Avatar({ src, alt, size = 32, className = "" }: { src: string; alt: string; size?: number; className?: string }) {
    return (
      <img src={src} alt={alt} width={size} height={size} className={"rounded-full object-cover border border-white/10 " + className} />
    );
  }
  