import { motion } from "framer-motion";
import { useRef } from "react";
import { Download } from "lucide-react";
import { downloads } from "../data/downloads";

export default function FinalCTA() {
  const btnRef = useRef<HTMLAnchorElement>(null);

  // Subtle magnetic button (pointer-fine devices only)
  const onMove = (e: React.MouseEvent) => {
    if (!btnRef.current) return;
    if (window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = btnRef.current.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    btnRef.current.style.transform = `translate(${x * 0.12}px, ${y * 0.12}px)`;
  };
  const onLeave = () => {
    if (btnRef.current) btnRef.current.style.transform = "";
  };

  const installer = downloads.find((d) => d.recommended) ?? downloads[0];

  return (
    <section className="final" aria-label="Final call to action">
      <div className="container">
        <motion.h2
          initial={{ opacity: 0, y: 32, filter: "blur(6px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          Your next study session
          <br />
          <span style={{ color: "var(--text-faint)" }}>doesn't need another tab.</span>
        </motion.h2>

        <a
          ref={btnRef}
          href={installer.url}
          className="btn btn-primary"
          style={{ padding: "18px 36px", fontSize: 17, transition: "transform 0.25s ease" }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          download
        >
          <Download size={19} aria-hidden /> Download for Windows
        </a>

        <p className="meta">WINDOWS • 64-BIT • FREE TO DOWNLOAD</p>
      </div>
    </section>
  );
}
