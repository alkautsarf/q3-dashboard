'use client'
import Image from "next/image";
import Background from "@/app/components/Background";
import StaggeredMenu from "@/app/components/Menu";
import Hero from "@/app/components/Hero";
import ChallengesGrid from "@/app/components/ChallengesGrid";
import Footer from "@/app/components/Footer";

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
  { label: "LinkedIn", link: "https://linkedin.com/in/alkautsar-f" },
];

export default function Home() {
  return (
    <div className="relative min-h-screen bg-white">
      {/* Overlay Staggered Menu */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        <StaggeredMenu
          className="pointer-events-auto"
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
          onMenuOpen={() => console.log('Menu opened')}
          onMenuClose={() => console.log('Menu closed')}
        />
      </div>
      {/* Animated background behind content (keep above page background) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Background
          particleColors={["#000000", "#000000"]}
          particleCount={250}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover={true}
          alphaParticles={true}
          disableRotation={false}
        />
      </div>

      {/* Foreground content */}
      <main className="relative z-10">
        <Hero />
        <ChallengesGrid />
        <Footer />
      </main>
    </div>
  );
}
