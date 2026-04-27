"use client";

import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import Image from "next/image";
import { PHONE_NUMBER, SMS_LINK } from "@/lib/constants";
import { MessageSpotButton } from "@/components/MessageSpotButton";

const QR_VALUE = `sms:+19294430153?body=${encodeURIComponent(
  "Hi Spot — I want to understand my insurance policy."
)}`;

function PhoneLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={SMS_LINK}
      aria-label={`Text Spot at ${PHONE_NUMBER}`}
      className={`inline-flex items-center min-h-[36px] px-3 -mx-1 -my-1 rounded-[18px] rounded-br-[4px] border border-white/15 text-sm font-normal text-white transition-[color,background-color,border-color,font-weight] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none cursor-pointer motion-reduce:transition-none hover:font-medium hover:border-transparent hover:bg-[#A0D2FA] hover:text-[#111827] focus-visible:ring-2 focus-visible:ring-[#A0D2FA] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 ${className}`}
    >
      {PHONE_NUMBER}
    </a>
  );
}

export function TrySpotHeading() {
  return (
    <p className="text-2xl sm:text-3xl font-heading font-normal text-white inline-flex items-center gap-2">
      <span>Try</span>
      <Image
        src="/imessage.png"
        alt=""
        aria-hidden="true"
        width={28}
        height={28}
        className="select-none shrink-0"
      />
      <span>Spot</span>
    </p>
  );
}

export function TrySpotCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: 0.3,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="flex flex-col items-center gap-5 sm:gap-6 text-center"
    >
      <TrySpotHeading />

      <p className="text-base text-white/70 max-w-xs mx-auto hidden md:block leading-relaxed">
        Scan the QR code to text <PhoneLink /> and try Spot for yourself.
      </p>

      <p className="text-base text-white/70 max-w-sm mx-auto block md:hidden leading-relaxed">
        Text <PhoneLink /> and try Spot for yourself.
      </p>

      <div
        className="hidden md:block p-4 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm"
        role="img"
        aria-label={`QR code that opens iMessage to text Spot at ${PHONE_NUMBER}`}
      >
        <QRCodeSVG
          value={QR_VALUE}
          size={140}
          level="M"
          bgColor="transparent"
          fgColor="#ffffff"
        />
      </div>

      <div className="md:hidden">
        <MessageSpotButton size="md" />
      </div>
    </motion.div>
  );
}
