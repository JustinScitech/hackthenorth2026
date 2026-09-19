import Image from "next/image";
import Link from "next/link";

/** The Astra Risk asterisk mark. Transparent PNG, so it sits on light and dark surfaces alike. */
export function Mark({ size = 28, priority = false }: { size?: number; priority?: boolean }) {
  return <Image src="/brand/astra-mark.png" alt="" width={size} height={size} priority={priority} />;
}

/** Mark plus wordmark. The text is HTML so it follows the active theme. */
export function Wordmark({ href = "/", size = 28, className = "brand" }: { href?: string; size?: number; className?: string }) {
  return <Link className={className} href={href} aria-label="Astra Risk"><Mark size={size} /><span className="brand-text">Astra Risk</span></Link>;
}
