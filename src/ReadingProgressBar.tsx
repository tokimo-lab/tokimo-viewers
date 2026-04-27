import type { RefObject } from "react";
import { useEffect, useState } from "react";

export function ReadingProgressBar({
  color,
  containerRef,
}: {
  color: string;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      if (scrollHeight <= 0) {
        setProgress(100);
        return;
      }
      setProgress(Math.min(100, (scrollTop / scrollHeight) * 100));
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener("scroll", handleScroll);
  }, [containerRef]);

  return (
    <div className="absolute top-0 right-0 left-0 z-10 h-[3px]">
      <div
        className="h-full transition-[width] duration-150"
        style={{ width: `${progress}%`, backgroundColor: color }}
      />
    </div>
  );
}
