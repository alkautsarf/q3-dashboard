"use client";
import React from "react";

type Props = {
  width?: number; // px
  height?: number; // px (used for centering only)
  children: React.ReactNode;
};

// Minimal draggable wrapper with a top handle strip. Centers by default.
export default function DraggableWindow({ width = 820, height = 560, children }: Props) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const dragState = React.useRef<{ dragging: boolean; dx: number; dy: number }>({ dragging: false, dx: 0, dy: 0 });

  React.useEffect(() => {
    const center = () => {
      const x = Math.max(12, Math.round((window.innerWidth - width) / 2));
      const y = Math.max(12, Math.round((window.innerHeight - height) / 2));
      setPos({ x, y });
    };
    center();
    window.addEventListener("resize", center);
    return () => window.removeEventListener("resize", center);
  }, [width, height]);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current.dragging) return;
      setPos((p) => {
        if (!p) return p;
        const x = e.clientX - dragState.current.dx;
        const y = e.clientY - dragState.current.dy;
        return { x: Math.max(0, x), y: Math.max(0, y) };
      });
    };
    const onUp = () => {
      dragState.current.dragging = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div
      className="absolute"
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, width }}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        // Avoid starting drag from interactive text inputs/contentEditable
        const tag = target.tagName.toLowerCase();
        const interactive = tag === "input" || tag === "textarea" || target.isContentEditable;
        if (interactive) return;
        dragState.current.dragging = true;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        dragState.current.dx = e.clientX - rect.left;
        dragState.current.dy = e.clientY - rect.top;
      }}
    >
      {children}
    </div>
  );
}
