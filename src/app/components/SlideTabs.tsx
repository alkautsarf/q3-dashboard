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
  const containerRef = useRef<HTMLUListElement | null>(null);

  const moveToIndex = (idx: number, show = true) => {
    const el = tabRefs.current[idx];
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const scrollLeft = containerRef.current?.scrollLeft ?? 0;
    setPosition({ left: el.offsetLeft - scrollLeft, width, height, opacity: show ? 1 : 0 });
  };

  // Initialize cursor to active tab and keep it in sync on resize
  useEffect(() => {
    moveToIndex(active, true);
    const onResize = () => moveToIndex(active, true);
    window.addEventListener("resize", onResize);
    const el = containerRef.current;
    const onScroll = () => moveToIndex(active, true);
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      el?.removeEventListener("scroll", onScroll as any);
    };
  }, [active, tabs.length]);

  return (
    <ul
      ref={containerRef}
      onMouseLeave={() => moveToIndex(active, true)}
      className="relative mx-auto flex w-auto max-w-full overflow-x-auto no-scrollbar flex-nowrap rounded-full border-2 border-black bg-white p-1"
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
          getScrollLeft={() => containerRef.current?.scrollLeft ?? 0}
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
  getScrollLeft: () => number;
}

const Tab: React.FC<TabProps> = ({ children, setPosition, onClick, provideRef, getScrollLeft }) => {
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
        const scrollLeft = getScrollLeft();

        setPosition({
          left: ref.current.offsetLeft - scrollLeft,
          width,
          height,
          opacity: 1,
        });
      }}
      onClick={onClick}
      className="relative z-10 block cursor-pointer px-3 sm:px-4 py-2 text-xs sm:text-sm uppercase text-white mix-blend-difference whitespace-nowrap"
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
