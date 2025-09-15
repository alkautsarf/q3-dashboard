"use client";
import Background from "../components/Background";
import StaggeredMenu from "../components/Menu";

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

export default function Page() {
  return (
    <div className="relative min-h-screen p-4">
      {/* Overlay Staggered Menu */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        <StaggeredMenu
          position="right"
          className="z-10 md:z-40"
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
      <div className="fixed inset-0 -z-10">
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
      <div className="fixed inset-0 flex justify-center items-center">
        <p className="glitch text-5xl text-black" data-text="🚧 Under Construction 🚧">🚧 Under Construction 🚧</p>
      </div>
    </div>
  );
}
