import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function BGPattern({
  variant = "grid",
  mask = "fade-edges",
  className,
}: {
  variant?: "grid" | "dots";
  mask?: "fade-edges" | "fade-center" | "none";
  className?: string;
}) {
  const maskCss: Record<string, string> = {
    "fade-edges":
      "[mask-image:radial-gradient(ellipse_at_center,var(--color-background),transparent)]",
    "fade-center":
      "[mask-image:radial-gradient(ellipse_at_center,transparent,var(--color-background))]",
    none: "",
  };
  const bgImage =
    variant === "grid"
      ? "linear-gradient(to right, rgb(139,92,246,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(139,92,246,0.08) 1px, transparent 1px)"
      : "radial-gradient(rgb(139,92,246,0.12) 1px, transparent 1px)";
  return (
    <div
      className={cn(
        "absolute inset-0 z-0 size-full pointer-events-none",
        maskCss[mask] ?? "",
        className,
      )}
      style={{ backgroundImage: bgImage, backgroundSize: "24px 24px" }}
    />
  );
}

export function GlowCard({
  children,
  className,
  glowColor = "purple",
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: "purple" | "magenta" | "teal";
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = (e: PointerEvent) => {
      if (cardRef.current) {
        cardRef.current.style.setProperty("--x", e.clientX.toFixed(2));
        cardRef.current.style.setProperty("--y", e.clientY.toFixed(2));
      }
    };
    document.addEventListener("pointermove", sync);
    return () => document.removeEventListener("pointermove", sync);
  }, []);

  const hueMap = { purple: 280, magenta: 342, teal: 160 };
  const spreadMap = { purple: 300, magenta: 200, teal: 200 };
  const base = hueMap[glowColor];
  const spread = spreadMap[glowColor];

  return (
    <>
      <style>{`
        [data-glow-card] {
          --base: ${base};
          --spread: ${spread};
          --radius: 16;
          --border: 1;
          --size: 220;
          --hue: calc(var(--base) + (var(--xp,0) * var(--spread,0)));
          background-image: radial-gradient(
            calc(var(--size,150)*1px) calc(var(--size,150)*1px) at
            calc(var(--x,0)*1px) calc(var(--y,0)*1px),
            hsl(var(--hue,210) 100% 70% / 0.06),
            transparent
          );
          background-attachment: fixed;
          border: calc(var(--border,1)*1px) solid transparent;
          position: relative;
        }
        [data-glow-card]::before {
          content: "";
          position: absolute;
          inset: calc(var(--border,1)*-1px);
          border: calc(var(--border,1)*1px) solid transparent;
          border-radius: calc(var(--radius)*1px);
          background: radial-gradient(
            calc(var(--size,150)*0.6px) calc(var(--size,150)*0.6px) at
            calc(var(--x,0)*1px) calc(var(--y,0)*1px),
            hsl(var(--hue,210) 100% 60% / 0.5),
            transparent 100%
          );
          background-attachment: fixed;
          mask: linear-gradient(transparent,transparent),linear-gradient(white,white);
          mask-clip: padding-box, border-box;
          mask-composite: intersect;
          pointer-events: none;
        }
      `}</style>
      <div
        ref={cardRef}
        data-glow-card
        className={cn(
          "rounded-2xl backdrop-blur-md",
          "bg-[rgba(17,6,39,0.65)]",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
