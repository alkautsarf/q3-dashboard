"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { SupportedNetwork } from "@/app/lib/alchemy";

export type NetworkKey = SupportedNetwork;

interface NetworkSelectorProps {
  value: NetworkKey;
  onChange: (next: NetworkKey) => void;
}

const labels: Record<NetworkKey, string> = {
  mainnet: "Mainnet",
  base: "Base",
  arbitrum: "Arbitrum",
};

export function NetworkSelector({ value, onChange }: NetworkSelectorProps) {
  const options: NetworkKey[] = ["mainnet", "arbitrum"];

  // Animated cursor logic (mirrors SlideTabs behavior)
  type Position = { left: number; width: number; height: number; opacity: number };
  const [position, setPosition] = useState<Position>({ left: 0, width: 0, height: 0, opacity: 0 });
  const tabRefs = useRef<(HTMLLIElement | null)[]>([]);
  const activeIndex = useMemo(() => Math.max(0, options.indexOf(value)), [options, value]);

  const moveToIndex = (idx: number, show = true) => {
    const el = tabRefs.current[idx];
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({ left: el.offsetLeft, width, height, opacity: show ? 1 : 0 });
  };

  useEffect(() => {
    moveToIndex(activeIndex, true);
    const onResize = () => moveToIndex(activeIndex, true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeIndex]);

  return (
    <ul
      onMouseLeave={() => moveToIndex(activeIndex, true)}
      className="relative mx-auto flex w-fit rounded-full border-2 border-black bg-white p-1"
    >
      {options.map((opt, idx) => (
        <li
          key={opt}
          ref={(el) => (tabRefs.current[idx] = el)}
          onMouseEnter={() => moveToIndex(idx, true)}
          onClick={() => {
            moveToIndex(idx, true);
            onChange(opt);
          }}
          aria-selected={value === opt}
          className="relative z-10 block cursor-pointer px-4 py-2 text-sm uppercase text-white mix-blend-difference select-none"
        >
          {labels[opt]}
        </li>
      ))}
      <motion.li
        animate={{ left: position.left, width: position.width, height: position.height, opacity: position.opacity }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute z-0 rounded-full bg-black"
      />
    </ul>
  );
}

export default NetworkSelector;
