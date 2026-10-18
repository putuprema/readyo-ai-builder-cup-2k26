import { formatRupiah } from "@adidi/shared";
import { ApiStatus } from "@/components/ApiStatus";
import { SiteHeader } from "@/components/SiteHeader";

const SAMPLE_TARGET = 1_520_000_000;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto box-border flex w-full max-w-[1120px] flex-col gap-10 px-4 py-14 sm:px-8 sm:py-[72px]">
        <section className="flex flex-wrap items-start gap-12">
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
            <span className="self-start rounded-full bg-accent-tint px-3 py-1.5 font-bold text-[13px] text-accent-strong">
              Foundation: hello world
            </span>
            <h1 className="m-0 max-w-[600px] font-extrabold text-[36px] leading-[1.1] tracking-[-0.03em] sm:text-[48px]">
              Find out how far you are from the house, the car, or the wedding, and what to change
              to get there sooner.
            </h1>
            <p className="m-0 max-w-[560px] text-[17px] text-muted">
              Upload a month of bank, e-wallet and PayLater statements. We turn them into one
              answer: the month you'd be ready, which numbers are holding you back, and a plan
              checked against the same rules a bank uses.
            </p>
            <p className="m-0 text-[13px] text-muted">
              Sample target from the shared package: {formatRupiah(SAMPLE_TARGET)}
            </p>
          </div>

          <div className="min-w-0 flex-[1_1_360px]">
            <ApiStatus />
          </div>
        </section>
      </main>
    </>
  );
}
