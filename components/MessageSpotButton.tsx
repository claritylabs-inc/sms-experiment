"use client";

import Image from "next/image";
import { SMS_LINK } from "@/lib/constants";

type Size = "lg" | "md";

const sizeMap = {
  lg: {
    h: "h-[56px] sm:h-[60px]",
    px: "px-5 sm:px-6",
    minW: "min-w-[260px] sm:min-w-[300px]",
    gap: "gap-2.5 sm:gap-3",
    iconSize: 36,
    text: "text-[15px] sm:text-[16px]",
  },
  md: {
    h: "h-[48px] sm:h-[52px]",
    px: "px-4 sm:px-5",
    minW: "min-w-[220px] sm:min-w-[240px]",
    gap: "gap-2 sm:gap-2.5",
    iconSize: 30,
    text: "text-[14px] sm:text-[14.5px]",
  },
} as const;

export function MessageSpotButton({
  size = "lg",
  className = "",
}: {
  size?: Size;
  className?: string;
}) {
  const s = sizeMap[size];

  return (
    <a
      href={SMS_LINK}
      aria-label="Message Spot to read your insurance policy"
      className={`group inline-flex ${s.h} ${s.minW} ${s.px} ${s.gap} items-center justify-center rounded-full transition-transform duration-200 ease-out outline-none hover:scale-[0.985] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#A0D2FA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100 ${className}`}
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #f7f5f0 100%)",
        boxShadow: [
          "rgba(255,255,255,0.9) 0 1px 0 0 inset",
          "rgba(17,24,39,0.08) 0 0 0 1px inset",
          "rgba(17,24,39,0.05) 0 1px 2px",
          "rgba(17,24,39,0.08) 0 6px 14px -4px",
          "rgba(17,24,39,0.05) 0 16px 32px -10px",
        ].join(", "),
      }}
    >
      <Image
        src="/imessage.png"
        alt=""
        aria-hidden="true"
        width={s.iconSize}
        height={s.iconSize}
        className="select-none shrink-0 transition-transform duration-200 ease-out group-active:scale-95 motion-reduce:transition-none motion-reduce:group-active:scale-100"
        priority
        style={{
          filter:
            "drop-shadow(0 1px 1px rgba(0,0,0,0.08)) drop-shadow(0 2px 4px rgba(0,0,0,0.06))",
        }}
      />
      <span
        className={`${s.text} font-medium tracking-[-0.015em] text-[#111827]`}
      >
        Message Spot
      </span>
    </a>
  );
}
