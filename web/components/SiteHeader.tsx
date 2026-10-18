export function SiteHeader() {
  return (
    <header className="border-line border-b bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-[1120px] flex-wrap items-center gap-6 px-4 sm:px-8">
        <a
          href="/"
          className="flex items-center gap-2.5 font-extrabold text-[17px] text-ink tracking-[-0.01em] no-underline"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 18 10 12l4 4 6-8" />
            </svg>
          </span>
          [APP NAME]
        </a>
      </div>
    </header>
  );
}
