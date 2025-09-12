"use client";
import Terminal from "../components/Terminal";
import Background from "../components/Background";
import DraggableWindow from "../components/DraggableWindow";

export default function Page() {
  return (
    <div className="relative min-h-screen p-4">
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
      <DraggableWindow width={960} height={620}>
        <Terminal />
      </DraggableWindow>
    </div>
  );
}
