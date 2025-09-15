"use client";
import React from "react";

type Props = { title?: string; children: React.ReactNode; className?: string };

export default function GlassCard({ title, children, className = "" }: Props) {
  return (
    <div className={`border-2 border-black rounded-xl bg-white/80 backdrop-blur-sm ${className} overflow-hidden`}>
      {title && (
        <div className="px-4 py-2 border-b-2 border-black bg-[#B8AA98] text-sm font-medium uppercase tracking-wide">
          {title}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

