"use client";
import React from "react";

import type { ReactNode } from "react";
type Line = { id: number; content: ReactNode; pad?: boolean };
type Props = {
  lines: Line[];
  inputValue: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onEnter: () => void;
};

// Scrollback log (history) + inline prompt at the end (terminal-like).
export default function TerminalLog({ lines, inputValue, placeholder, onChange, onEnter }: Props) {
  const endRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, inputValue]);

  return (
    <div className="w-full h-[540px] overflow-y-auto bg-transparent">
      <ul className="text-sm font-mono leading-relaxed text-black">
        {lines.length === 0 ? (
          <li className="px-4 py-2 text-gray-600">No output. Type /help to begin.</li>
        ) : (
          lines.map((l) => (
            <li
              key={l.id}
              className={(l.pad === false ? "px-0" : "px-4") + " py-1 whitespace-pre-wrap"}
            >
              {l.content}
            </li>
          ))
        )}
        {/* Prompt line inline */}
        <li className="px-4 py-2 flex items-center gap-2 text-black">
          <span className="text-green-600">❯</span>
          <input
            value={inputValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEnter();
            }}
            placeholder={placeholder}
            className="w-full bg-transparent outline-none placeholder-gray-500"
          />
        </li>
      </ul>
      <div ref={endRef} />
    </div>
  );
}
