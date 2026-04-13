"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FadeIn } from "@/components/FadeIn";

/* ---------- Types ---------- */

type RawMessage = { from: "user" | "spot"; text: string; image?: string };

type BubbleMessage =
  | { type: "incoming"; text: string; status: "typing" | "ready"; image?: string }
  | { type: "outgoing"; text: string; image?: string };

/* ---------- Tab data ---------- */

const TABS: { key: string; label: string; messages: RawMessage[] }[] = [
  {
    key: "analyze",
    label: "Analyze",
    messages: [
      { from: "user", text: "", image: "/brokey.jpg" },
      { from: "user", text: "📎 State_Farm_Auto_Policy.pdf" },
      { from: "user", text: "is this thing even worth insuring" },
      { from: "spot", text: "", image: "/sassy.jpg" },
      { from: "spot", text: "your collision deductible costs more than this car is worth honestly\n\nLiability: $300K/$100K ✓\nCollision: $1K deductible\nComp: $500 deductible\n\nalso zero rideshare coverage so if you uber on the side you're cooked" },
    ],
  },
  {
    key: "qa",
    label: "Ask questions",
    messages: [
      { from: "user", text: "", image: "/ford.jpg" },
      { from: "user", text: "does my pool coverage handle this" },
      { from: "spot", text: "Your pool coverage is for the pool, not whatever is currently parked in it.\n\nThe car is on your auto policy — comprehensive would cover this minus your $500 deductible. The pool damage is on your homeowners.\n\nYou're filing two claims today." },
    ],
  },
  {
    key: "email",
    label: "Email proof",
    messages: [
      { from: "user", text: "my landlord is being annoying and wants proof of insurance by tonight can u just send it to her" },
      { from: "spot", text: "", image: "/annoyed.jpg" },
      { from: "spot", text: "say less. what's her email" },
      { from: "user", text: "sarah@building.co" },
      { from: "spot", text: "✉️ done — drafted and ready:\n\nTo: sarah@building.co\nRe: Proof of Insurance — Apt 4B\n\nreply 'send' and she'll have it in 30 seconds. you're welcome." },
    ],
  },
  {
    key: "remind",
    label: "Reminders",
    messages: [
      { from: "spot", text: "hey — your auto policy expires in 30 days. you probably forgot about this. want me to remind you before it lapses?" },
      { from: "user", text: "omg yes i literally would have forgotten" },
      { from: "spot", text: "that's why i'm here. i'll text you may 8th so you have a week to figure it out 👍" },
      { from: "user", text: "ily spot 🫶" },
      { from: "spot", text: "", image: "/meme.jpg" },
    ],
  },
  {
    key: "portfolio",
    label: "Portfolio",
    messages: [
      { from: "user", text: "", image: "/toilet.jpg" },
      { from: "user", text: "is this covered. also 📎 Renters_Policy.pdf" },
      { from: "spot", text: "bro how does that even happen" },
      { from: "spot", text: "ok so the toilet — if you caused it, your renters liability covers the damage to the landlord's unit. if the water hit the unit below you, that's also on your liability.\n\nbut looking at your policy:\n\n⚠️ your liability limit is $100K. if water damage hits multiple units that might not be enough\n\n⚠️ personal property limit is $15K — if your stuff got water damaged too, that's tight\n\n⚠️ jewelry sub-limit is $1,500. basically decorative at that point" },
    ],
  },
];

/* ---------- Timing ---------- */

const PAUSE_BEFORE_MSG = 800;
const TYPING_DURATION = 500;
const RESPONSE_DELAY = 700;
const LOOP_PAUSE = 5000;

/* ---------- iMessage bubble constants ---------- */

const BUBBLE_BLUE = "#007AFF";

const BUBBLE_ENTER = {
  initial: { opacity: 0, scale: 0.96, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
} as const;

/* ---------- Chat script hook ---------- */

function useChatScript(rawMessages: RawMessage[], cycle: number) {
  const [messages, setMessages] = useState<BubbleMessage[]>([]);

  useEffect(() => {
    setMessages([]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    let msgCount = 0;

    for (let i = 0; i < rawMessages.length; i++) {
      const raw = rawMessages[i];
      t += i === 0 ? 300 : PAUSE_BEFORE_MSG;

      if (raw.from === "user") {
        const delay = t;
        const img = raw.image;
        timers.push(
          setTimeout(() => {
            setMessages((prev) => [...prev, { type: "outgoing", text: raw.text, image: img }]);
          }, delay)
        );
        msgCount++;
      } else {
        const spotImage = raw.image;
        const isImageOnly = spotImage && !raw.text;

        if (isImageOnly) {
          // No typing dots — just send the image after a short delay
          t += 400;
          const delay = t;
          timers.push(
            setTimeout(() => {
              setMessages((prev) => [
                ...prev,
                { type: "incoming", text: "", status: "ready", image: spotImage },
              ]);
            }, delay)
          );
          msgCount++;
        } else {
          const typingDelay = t;
          const typingIdx = msgCount;
          timers.push(
            setTimeout(() => {
              setMessages((prev) => [
                ...prev,
                { type: "incoming", text: "", status: "typing" },
              ]);
            }, typingDelay)
          );
          msgCount++;

          t += TYPING_DURATION + RESPONSE_DELAY;
          const readyDelay = t;
          timers.push(
            setTimeout(() => {
              setMessages((prev) =>
                prev.map((m, idx) =>
                  idx === typingIdx && m.type === "incoming"
                    ? { type: "incoming", text: raw.text, status: "ready", image: spotImage }
                    : m
                )
              );
            }, readyDelay)
          );
        }
      }
    }

    return () => timers.forEach(clearTimeout);
  }, [cycle]);

  return messages;
}

/* ---------- Bubble components (exact iMessage style from clarity) ---------- */

function IncomingBubble({
  children,
  status = "ready",
  image,
}: {
  children: React.ReactNode;
  status?: "typing" | "ready";
  image?: string;
}) {
  return (
    <motion.div
      initial={BUBBLE_ENTER.initial}
      animate={BUBBLE_ENTER.animate}
      transition={BUBBLE_ENTER.transition}
      className="flex justify-start"
    >
      <div className={`relative rounded-[18px] rounded-bl-[4px] bg-[#e9e9eb] overflow-hidden min-h-[30px] ${status === "typing" ? "px-3 py-[7px]" : image && !children ? "max-w-[82%]" : "max-w-[82%] px-3 py-[7px]"}`}>
        {status === "typing" ? (
          <div className="flex items-center gap-[3px] py-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-[7px] h-[7px] rounded-full bg-[#8e8e93]"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
          >
            {image && (
              <img
                src={image}
                alt=""
                className="w-full h-auto max-h-[140px] object-cover"
                draggable={false}
              />
            )}
            {children && (
              <p className={`text-[13px] leading-[17px] text-black whitespace-pre-line ${image ? "px-3 py-[7px]" : ""}`}>
                {children}
              </p>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function OutgoingBubble({ text, image }: { text: string; image?: string }) {
  return (
    <motion.div
      initial={BUBBLE_ENTER.initial}
      animate={BUBBLE_ENTER.animate}
      transition={BUBBLE_ENTER.transition}
      className="flex justify-end"
    >
      <div
        className={`max-w-[82%] rounded-[18px] rounded-br-[4px] overflow-hidden ${image ? "" : "px-3 py-[7px]"}`}
        style={{ backgroundColor: BUBBLE_BLUE }}
      >
        {image && (
          <img
            src={image}
            alt=""
            className="w-full h-auto max-h-[140px] object-cover"
            draggable={false}
          />
        )}
        {text && (
          <p className={`text-[13px] leading-[17px] text-white whitespace-pre-line ${image ? "px-3 py-[7px]" : ""}`}>
            {text}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ---------- Chat card (iMessage phone mockup) ---------- */

function ChatCard({
  rawMessages,
  cycle,
}: {
  rawMessages: RawMessage[];
  cycle: number;
}) {
  const messages = useChatScript(rawMessages, cycle);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="w-[320px] h-[420px] rounded-2xl border border-black/[0.08] bg-white overflow-hidden flex flex-col shadow-lg text-left">
      <div className="flex-1 overflow-hidden relative min-h-0 p-4 flex flex-col">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pt-1 pb-2 flex flex-col gap-[10px]"
          style={{ scrollbarWidth: "none" }}
        >
          <AnimatePresence mode="popLayout">
            {messages.map((msg, i) =>
              msg.type === "incoming" ? (
                <IncomingBubble key={`${cycle}-in-${i}`} status={msg.status} image={msg.image}>
                  {msg.text}
                </IncomingBubble>
              ) : (
                <OutgoingBubble key={`${cycle}-out-${i}`} text={msg.text} image={msg.image} />
              )
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main section ---------- */

export function UseCasesSection() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);

  const handleTabChange = useCallback(
    (i: number) => {
      setActive(i);
      setCycle((c) => c + 1);
    },
    []
  );

  // Auto-replay current tab
  useEffect(() => {
    const tab = TABS[active];
    let totalTime = 300;
    for (let i = 0; i < tab.messages.length; i++) {
      totalTime += i === 0 ? 0 : PAUSE_BEFORE_MSG;
      if (tab.messages[i].from === "spot") {
        totalTime += TYPING_DURATION + RESPONSE_DELAY;
      }
    }
    const timer = setTimeout(
      () => setCycle((c) => c + 1),
      totalTime + LOOP_PAUSE
    );
    return () => clearTimeout(timer);
  }, [active, cycle]);

  return (
    <section className="bg-[#111827] min-h-dvh flex flex-col justify-center">
      <div className="px-6 py-20 sm:py-24 w-full">
        <div className="mx-auto max-w-5xl w-full text-center">
          <FadeIn>
            <h2 className="font-heading text-3xl sm:text-4xl tracking-tight mb-4 text-white">
              See it in action
            </h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-white/60 mb-12 max-w-lg mx-auto">
              Everything happens over text.
              <br />
              No app, no dashboard — just send a message.
            </p>
          </FadeIn>

          {/* iMessage chat card */}
          <FadeIn delay={0.2}>
            <div className="flex justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${active}-${cycle}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <ChatCard
                    rawMessages={[...TABS[active].messages]}
                    cycle={cycle}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </FadeIn>

          {/* Tab pills */}
          <FadeIn delay={0.3}>
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              {TABS.map((tab, i) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(i)}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
                    active === i
                      ? "bg-white text-[#111827]"
                      : "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
