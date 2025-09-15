import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative z-10 max-w-4xl mx-auto pt-28 px-6 text-center">
      <h1 className="glitch text-black tracking-tight font-semibold text-4xl sm:text-6xl " data-text="Build Beyond Limits.">
        Build Beyond Limits.
      </h1>
      <p className="mt-4 text-gray-600">
        Explore challenges, benchmark approaches, and keep the UI razor‑clean.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link href="/challenge1" className="px-5 py-2.5 rounded-full bg-black text-white hover:opacity-90 transition">
          Start Challenge 1
        </Link>
        <a
          href="https://github.com/alkautsarf/q3-dashboard/blob/main/README.md"
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-2.5 rounded-full border border-gray-300 text-black hover:bg-gray-50 transition"
        >
          View Docs
        </a>
      </div>
      <div className="mt-8 h-px" style={{ background: "#A59682" }} />
    </section>
  );
}

