/** A short centred message for the loading, signed-out and missing states of the pages. */
export function Notice({
  title,
  muted,
  children,
}: {
  title: string;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-4 py-16 sm:px-8">
      <h1
        className={`m-0 font-extrabold text-[24px] tracking-[-0.02em] ${muted ? "text-muted" : ""}`}
        aria-live="polite"
      >
        {title}
      </h1>
      {children && <p className="m-0 text-muted">{children}</p>}
    </main>
  );
}
