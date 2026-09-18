/** Frames the supplied MCCIA screenshot without altering the original logo. */
import Image from 'next/image';
export function McciaLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`mccia-logo ${className}`}>
      <Image
        src="/mccia-logo-source.png"
        alt="MCCIA"
        width={724}
        height={719}
        unoptimized
      />
    </span>
  );
}
