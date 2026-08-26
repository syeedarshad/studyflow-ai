import { motion, useReducedMotion as useFramerReduced } from "framer-motion";
import { useEffect, useRef } from "react";
import { ArrowDown, Download } from "lucide-react";
import { useReducedMotion } from "../hooks/useReducedMotion";

const line = {
  hidden: { y: "110%", filter: "blur(8px)" },
  show: (i: number) => ({
    y: "0%",
    filter: "blur(0px)",
    transition: { duration: 0.9, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Hero() {
  const reduced = useReducedMotion();
  const framerReduced = useFramerReduced();
  const lightRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Subtle cursor light + grid drift (desktop, motion allowed only)
  useEffect(() => {
    if (reduced || window.matchMedia("(pointer: coarse)").matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (lightRef.current)
          lightRef.current.style.transform = `translate(${e.clientX - 350}px, ${e.clientY - 350}px)`;
        if (gridRef.current)
          gridRef.current.style.transform = `translate(${(e.clientX / window.innerWidth - 0.5) * 14}px, ${(e.clientY / window.innerHeight - 0.5) * 14}px)`;
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const anim = framerReduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : line;

  return (
    <section className="hero" id="top">
      <div ref={gridRef} className="hero-grid" aria-hidden />
      <div ref={lightRef} className="hero-cursor-light" aria-hidden />

      <div className="container hero-content">
        <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1, duration: 0.6 }}>
          StudyFlow AI / Desktop
        </motion.p>

        <h1>
          <span className="mask-line">
            <motion.span custom={0} variants={anim} initial="hidden" animate="show">
              Study with a system.
            </motion.span>
          </span>
          <span className="mask-line">
            <motion.span custom={1} variants={anim} initial="hidden" animate="show" className="dim">
              Not just a schedule.
            </motion.span>
          </span>
        </h1>

        <motion.p
          className="hero-sub"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.7, ease: "easeOut" }}
        >
          StudyFlow brings planning, tasks, goals, Jass AI assistance and long-term
          progress into one focused desktop workspace.
        </motion.p>

        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.7, ease: "easeOut" }}
        >
          <a href="#download" className="btn btn-primary">
            <Download size={17} aria-hidden /> Download for Windows
          </a>
          <a href="#product" className="btn btn-ghost">
            Watch the flow <ArrowDown size={16} aria-hidden />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
