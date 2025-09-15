export default function Footer() {
  return (
    <footer className="relative z-10 max-w-5xl mx-auto px-6 pb-10 text-sm text-gray-500">
      <div className="flex items-center justify-between">
        <span>© {new Date().getFullYear()} elpabl0.eth</span>
        <div className="flex items-center gap-4">
          <a
            className="hover:text-[#A59682]"
            href="https://github.com/alkautsarf/q3-dashboard"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

