import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spot — Banner",
  robots: { index: false, follow: false },
};

export default function BannerPage() {
  return (
    <div className="min-h-dvh bg-white flex items-center justify-center p-12">
      <div className="w-full max-w-md flex flex-col gap-3">
        <div className="flex justify-end">
          <div className="max-w-[82%] rounded-[22px] rounded-br-[6px] px-4 py-2.5 bg-[#007AFF]">
            <p className="text-[17px] leading-[22px] text-white">
              my landlord is being annoying and wants proof of insurance by tonight can u just send it to her
            </p>
          </div>
        </div>

        <div className="flex justify-start">
          <div className="rounded-[22px] rounded-bl-[6px] bg-[#e9e9eb] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/annoyed.jpg"
              alt=""
              className="w-[180px] h-auto block"
              draggable={false}
            />
          </div>
        </div>

        <div className="flex justify-start">
          <div className="max-w-[82%] rounded-[22px] rounded-bl-[6px] px-4 py-2.5 bg-[#e9e9eb]">
            <p className="text-[17px] leading-[22px] text-black">
              say less. what&apos;s her email
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
