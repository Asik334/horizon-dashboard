"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useInView } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

/** Тактический счётчик: цифры "накручиваются" при появлении в вьюпорте. */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10px" });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 22, stiffness: 90 });

  useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, value, motionValue]);

  useEffect(() => {
    return spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString("ru-RU");
    });
  }, [spring]);

  return (
    <motion.span ref={ref} className={className}>
      0
    </motion.span>
  );
}
