import Link from "next/link";

function Item({ title, href, tag }: { title: string; href?: string; tag?: string }) {
  return (
    <div className="group border border-gray-200 rounded-xl p-5 hover:border-[#A59682] transition">
      <div className="flex items-center justify-between">
        <h3 className="text-black font-medium">{title}</h3>
        {tag ? <span className="text-xs text-gray-500">{tag}</span> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="mt-3 inline-block text-sm text-gray-600 group-hover:text-[#A59682] transition"
        >
          Open →
        </Link>
      ) : (
        <span className="mt-3 inline-block text-sm text-gray-400">Coming soon</span>
      )}
    </div>
  );
}

export default function ChallengesGrid() {
  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 pb-20">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Item title="Challenge 1 — Portfolio Indexer" href="/challenge1" tag="live" />
        <Item title="Challenge 2" tag="soon" />
        <Item title="Challenge 3" tag="soon" />
        <Item title="Docs" href="https://github.com/alkautsarf/q3-dashboard" />
      </div>
    </section>
  );
}

