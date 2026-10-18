"use client";

import Link from "next/link";
import type { BannerModel } from "./banner";

export function MonthlyBanner({ banner }: { banner: BannerModel }) {
  return (
    <section
      aria-label="Monthly check-in"
      className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[#F1D3A8] bg-[#FEF6EC] px-5 py-4"
    >
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#8A4A0B"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      <p className="m-0 flex-[1_1_360px] text-[#5A3207] text-[14px]">
        <strong className="text-[#3D2205]">{banner.title}</strong> {banner.body}
      </p>
      <Link
        href={banner.href}
        className="inline-flex min-h-11 items-center rounded-[10px] bg-[#B45309] px-4 font-bold text-[14px] text-white no-underline hover:bg-[#8A4A0B]"
      >
        {banner.cta}
      </Link>
    </section>
  );
}
