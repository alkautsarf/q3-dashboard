import React, { useRef, useState, ReactNode } from "react";
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
}

export const SlideTabs: React.FC<SlideTabsProps> = ({ tabs, onTabClick }) => {
  const [position, setPosition] = useState<Position>({
    left: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });

  return (
    <ul
      onMouseLeave={() => setPosition((pv) => ({ ...pv, opacity: 0 }))}
      className="relative mx-auto flex w-fit rounded-full border-2 border-black bg-white p-1"
    >
      {tabs.map((tabLabel, idx) => (
        <Tab
          key={tabLabel}
          setPosition={setPosition}
          onClick={() => onTabClick?.(idx, tabLabel)}
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
}

const Tab: React.FC<TabProps> = ({ children, setPosition, onClick }) => {
  const ref = useRef<HTMLLIElement>(null);

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