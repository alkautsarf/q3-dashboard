"use client";
import React from "react";

// Terminal container. Will orchestrate state and render child parts.
// See docs/challenges/challenge-2.md for the flow/state machine.
export default function Terminal() {
  return (
    <div className="w-full border border-black p-4 min-h-[320px]">
      {/* TODO: wire CommandHandler, Receipt, TxStatus, and optional TerminalLog */}
      <p className="text-sm text-black">Terminal placeholder</p>
    </div>
  );
}

