"use client";

import React from "react";
import { useAccount, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import Background from "@/app/components/Background";
import StaggeredMenu from "@/app/components/Menu";
import ConnectButtonCustom from "@/app/components/ConnectButton";
import GreetingForm from "@/app/components/GreetingForm";
import GreetingHistory from "@/app/components/GreetingHistory";

const menuItems = [
  { label: "Home", ariaLabel: "Go to home page", link: "/" },
  { label: "Challenge", ariaLabel: "Challenge 1", link: "/challenge1" },
  { label: "Challenge", ariaLabel: "Challenge 2", link: "/challenge2" },
  { label: "Challenge", ariaLabel: "Challenge 3", link: "/challenge3" },
  { label: "Challenge", ariaLabel: "Challenge 4", link: "/challenge4" },
];

const socialItems = [
  { label: "Twitter", link: "https://twitter.com" },
  { label: "GitHub", link: "https://github.com/alkautsarf/" },
  { label: "LinkedIn", link: "https://linkedin.com/in/alkausar-f" },
];

export default function Challenge4Page() {
  const { address, isConnected } = useAccount();
  const { data: ens } = useEnsName({ address, chainId: mainnet.id });
  const connectedLabel = React.useMemo(() => {
    if (!address) return null;
    if (ens) return ens;
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }, [address, ens]);
  return (
    <div className="relative min-h-screen bg-white text-black font-body">
      {/* Overlay Menu */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        <StaggeredMenu
          position="right"
          items={menuItems}
          socialItems={socialItems}
          displaySocials={true}
          displayItemNumbering={true}
          menuButtonColor="#000"
          openMenuButtonColor="#fff"
          changeMenuColorOnOpen={true}
          colors={["#B8AA98", "#A59682"]}
          logoUrl="/logo/q3.png"
          accentColor="#A59682"
          onMenuOpen={() => console.log("Menu opened")}
          onMenuClose={() => console.log("Menu closed")}
        />
      </div>

      {/* Animated background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Background
          particleColors={["#000000", "#000000"]}
          particleCount={220}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={90}
          moveParticlesOnHover={true}
          alphaParticles={true}
          disableRotation={false}
        />
      </div>

      <main className="relative z-10 p-6 pt-20 md:pt-6">
        {/* Header */}
        <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Challenge 4 — Greeting Wall
            </h1>
            <p className="text-sm text-gray-600 mt-1">Support greetings with ETH, ERC-20 (via EIP-2612 or Permit2), or free (non-premium).</p>
          </div>
          <div className="shrink-0 flex items-center">
            <ConnectButtonCustom />
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <GreetingForm />
          <GreetingHistory />
        </div>
      </main>
    </div>
  );
}
