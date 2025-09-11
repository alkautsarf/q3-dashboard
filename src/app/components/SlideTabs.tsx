import React, { useEffect, useRef, useState, ReactNode } from "react";
import { motion } from "framer-motion";

interface Position {
  left: number;
  width: number;
  height: number;
  opacity: number;
}

interface SlideTabsProps {
  tabs: string[];
  onTabClick?: (index: number, label: string) => void;
  defaultIndex?: number;
}

export const SlideTabs: React.FC<SlideTabsProps> = ({ tabs, onTabClick, defaultIndex = 0 }) => {
  const [position, setPosition] = useState<Position>({
    left: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });
  const [active, setActive] = useState<number>(Math.min(Math.max(defaultIndex, 0), Math.max(tabs.length - 1, 0)));
  const tabRefs = useRef<(HTMLLIElement | null)[]>([]);

  const moveToIndex = (idx: number, show = true) => {
    const el = tabRefs.current[idx];
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({ left: el.offsetLeft, width, height, opacity: show ? 1 : 0 });
  };

  // Initialize cursor to active tab and keep it in sync on resize
  useEffect(() => {
    moveToIndex(active, true);
    const onResize = () => moveToIndex(active, true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, tabs.length]);

  return (
    <ul
      onMouseLeave={() => moveToIndex(active, true)}
      className="relative mx-auto flex w-fit rounded-full border-2 border-black bg-white p-1"
    >
      {tabs.map((tabLabel, idx) => (
        <Tab
          key={tabLabel}
          setPosition={setPosition}
          onClick={() => {
            setActive(idx);
            moveToIndex(idx, true);
            onTabClick?.(idx, tabLabel);
          }}
          index={idx}
          provideRef={(el) => (tabRefs.current[idx] = el)}
        >
          {tabLabel}
        </Tab>
      ))}
      <Cursor position={position} />
    </ul>
  );
};

interface TabProps {
  children: ReactNode;
  setPosition: React.Dispatch<React.SetStateAction<Position>>;
  onClick?: () => void;
  index: number;
  provideRef?: (el: HTMLLIElement | null) => void;
}

const Tab: React.FC<TabProps> = ({ children, setPosition, onClick, provideRef }) => {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    provideRef?.(ref.current);
  }, [provideRef]);

  return (
    <li
      ref={ref}
      onMouseEnter={() => {
        if (!ref.current) return;

        const { width, height } = ref.current.getBoundingClientRect();

        setPosition({
          left: ref.current.offsetLeft,
          width,
          height,
          opacity: 1,
        });
      }}
      onClick={onClick}
      className="relative z-10 block cursor-pointer px-4 py-2 text-sm uppercase text-white mix-blend-difference"
    >
      {children}
    </li>
  );
};

interface CursorProps {
  position: Position;
}

const Cursor: React.FC<CursorProps> = ({ position }) => {
  return (
    <motion.li
      animate={{
        left: position.left,
        width: position.width,
        height: position.height,
        opacity: position.opacity,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute z-0 rounded-full bg-black"
    />
  );
};
