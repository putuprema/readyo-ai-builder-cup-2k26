import type { PathCard } from "./model";

const BADGE: Record<PathCard["badge"]["tone"], string> = {
  blocked: "bg-blocked text-white",
  passes: "bg-accent text-white",
  muted: "bg-page text-muted",
};

/** The two path cards (one for a wedding); the leading one has the accent outline. */
export function PathCards({ cards }: { cards: PathCard[] }) {
  return (
    <section
      aria-label="Cash and loan paths"
      className={`grid grid-cols-1 gap-5 ${cards.length > 1 ? "lg:grid-cols-2" : ""}`}
    >
      {cards.map((card) => (
        <article
          key={card.path}
          className={`flex flex-col gap-4 rounded-2xl bg-surface px-5 py-5 sm:px-7 sm:py-6 ${
            card.leading ? "border-2 border-accent" : "border border-line"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              className={`m-0 font-bold text-[13px] uppercase tracking-[0.06em] ${
                card.leading ? "text-accent-strong" : "text-muted"
              }`}
            >
              {card.title}
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 font-semibold text-[12px] ${BADGE[card.badge.tone]}`}
            >
              {card.badge.text}
            </span>
          </div>
          <p className="m-0 flex flex-wrap items-baseline gap-2.5">
            <span
              className={`font-extrabold text-[48px] leading-none tabular-nums tracking-[-0.03em] sm:text-[56px] ${
                card.leading ? "" : "text-muted"
              }`}
            >
              {card.big.value}
            </span>
            <span className="font-semibold text-[18px] text-muted">{card.big.unit}</span>
          </p>
          <dl className="m-0 flex flex-col gap-1.5 text-[14px]">
            {card.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <dt className="text-muted">{row.label}</dt>
                <dd className="m-0 text-right font-bold tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
          {card.path === "loan" &&
            (card.blockedBy.length > 0 ? (
              <div className="flex flex-col gap-1 rounded-[10px] border border-[#F3C9C2] bg-[#FDF2F0] px-3.5 py-3">
                <span className="font-bold text-[#8A1A12] text-[12px] uppercase tracking-[0.06em]">
                  Blocked by
                </span>
                <span className="text-[14px]">
                  {card.blockedBy.map((item, i) => (
                    <span key={item}>
                      {i > 0 && " · "}
                      <strong>{item.split(" vs ")[0]}</strong>
                      {item.includes(" vs ") ? ` vs ${item.split(" vs ")[1]}` : ""}
                    </span>
                  ))}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1 rounded-[10px] border border-accent/30 bg-accent-tint px-3.5 py-3">
                <span className="font-bold text-[12px] text-accent-strong uppercase tracking-[0.06em]">
                  Approvable today
                </span>
                <span className="text-[14px]">
                  Every lending rule passes on this month's numbers.
                </span>
              </div>
            ))}
          {card.note && <p className="m-0 text-[14px] text-muted">{card.note}</p>}
        </article>
      ))}
    </section>
  );
}
