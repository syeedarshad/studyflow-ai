import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring, useReducedMotion as useFramerReduced } from "framer-motion";

export default function ProductReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useFramerReduced();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });

  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  const blur = useTransform(scrollYProgress, [0, 1], [10, 0]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [0.3, 1]);

  // Subtle pointer tilt
  const rotateX = useSpring(0, { stiffness: 120, damping: 20 });
  const rotateY = useSpring(0, { stiffness: 120, damping: 20 });

  const onPointerMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rotateY.set(px * 4);
    rotateX.set(-py * 3);
  };
  const onPointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <section className="reveal-section" id="product" ref={ref} aria-label="StudyFlow application preview">
      <div className="container">
        <motion.p className="eyebrow" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          The application
        </motion.p>
        <motion.div
          style={reduced ? undefined : { scale, filter, opacity, rotateX, rotateY, perspective: 1200, transformStyle: "preserve-3d" }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          className="app-frame"
        >
          <img
            src="/images/screenshots/app-main.png"
            alt="StudyFlow AI desktop application showing the dashboard with plans, tasks and progress"
            loading="lazy"
          />
          <div className="app-caption">
            <span>StudyFlow AI — Dashboard</span>
            <span>Windows</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
