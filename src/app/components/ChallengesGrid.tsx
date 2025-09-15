import Link from "next/link";

function Item({
  title,
  href,
  tag,
}: {
  title: string;
  href?: string;
  tag?: string;
}) {
  const CardInner = (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-black font-medium">{title}</h3>
        {tag == "live" ? (
          <span className="text-xs text-green-600">{tag}</span>
        ) : (
          <span className="text-xs text-yellow-600">{tag}</span>
        )}
      </div>
      {href ? (
        <span className="mt-3 inline-block text-sm text-gray-600 group-hover:text-[#A59682] transition">
          Open →
        </span>
      ) : (
        <span className="mt-3 inline-block text-sm text-gray-400">Coming soon</span>
      )}
    </>
  );

  return href ? (
    <Link
      href={href}
      className="group border border-gray-200 rounded-xl p-5 hover:border-[#A59682] transition block"
    >
      {CardInner}
    </Link>
  ) : (
    <div className="group border border-gray-200 rounded-xl p-5 opacity-100">
      {CardInner}
    </div>
  );
}

export default function ChallengesGrid() {
  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 pb-20">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Item
          title="Challenge 1 — Multi-Read Dashboard"
          href="/challenge1"
          tag="live"
        />
        <Item
          title="Challenge 2 - Multi-Send Tool"
          href="/challenge2"
          tag="live"
        />
        <Item
          title="Challenge 3 - Cross-Protocol Yield Tracker"
          href="/challenge3"
          tag="ongoing"
        />
        <Item title="Challenge 4 — Greeting Wall" href="/challenge4" tag="live" />
      </div>
    </section>
  );
}
