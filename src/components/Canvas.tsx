import { useEffect, useRef } from "react";

function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      draw(ctx, rect.width, rect.height);
    };

    const draw = (c: CanvasRenderingContext2D, w: number, h: number) => {
      // Clear with background color
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      c.fillStyle = isDark ? "#111827" : "#ffffff";
      c.fillRect(0, 0, w, h);

      // Draw grid dots as canvas placeholder
      c.fillStyle = isDark ? "#374151" : "#e5e7eb";
      const spacing = 24;
      for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
          c.beginPath();
          c.arc(x, y, 1, 0, Math.PI * 2);
          c.fill();
        }
      }

      // Placeholder text
      c.fillStyle = isDark ? "#6b7280" : "#9ca3af";
      c.font = "16px Inter, system-ui, sans-serif";
      c.textAlign = "center";
      c.fillText("DraftInk — Canvas ready", w / 2, h / 2);
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: "none" }}
    />
  );
}

export default Canvas;
