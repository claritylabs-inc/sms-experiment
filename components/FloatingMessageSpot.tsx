"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MessageSpotButton } from "@/components/MessageSpotButton";

export function FloatingMessageSpot() {
  const [show, setShow] = useState(false);
  const reduceMotion = useReducedMotion();
  const ticking = useRef(false);

  useEffect(() => {
    const update = () => {
      setShow(window.scrollY > window.innerHeight * 0.6);
      ticking.current = false;
    };
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: show ? 1 : 0,
        y: show ? 0 : reduceMotion ? 0 : 40,
      }}
      transition={{
        duration: reduceMotion ? 0 : 0.25,
        ease: [0.32, 0.72, 0, 1],
      }}
      style={{
        pointerEvents: show ? "auto" : "none",
        bottom: "max(20px, calc(env(safe-area-inset-bottom) + 12px))",
      }}
      className="fixed left-1/2 z-50 -translate-x-1/2"
      aria-hidden={!show}
    >
      <MessageSpotButton size="md" />
    </motion.div>
  );
}
