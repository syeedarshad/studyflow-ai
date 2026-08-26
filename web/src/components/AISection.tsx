import { motion } from "framer-motion";
import { ShieldCheck, Sparkles } from "lucide-react";

const STEPS = [
  { label: "Input", body: "Your goal or syllabus topic", highlight: false },
  { label: "Analyze", body: "Jass AI reviews your context — subjects, deadlines, and schedule", highlight: false },
  { label: "Output", body: "A structured, prioritized study plan with focused sessions", highlight: true },
  { label: "You", body: "Review and adapt. Nothing is locked until you approve it.", highlight: false },
];

export default function AISection() {
  return (
    <section className="ai-section" id="ai" aria-label="Jass AI assistance">
      <div className="container">
        <motion.p className="eyebrow" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={14} color="var(--accent)" aria-hidden /> Powered by Jass AI
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 24, filter: "blur(4px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          Intelligent study assistance.
          <br />
          <span style={{ color: "var(--text-faint)" }}>Always in your control.</span>
        </motion.h2>

        <motion.div
          className="ai-flow"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {STEPS.map((s, i) => (
            <div className={`ai-step ${s.highlight ? "highlight" : ""}`} key={i}>
              <span className="step-label">{`0${i + 1} / ${s.label}`}</span>
              <span className="step-body">{s.body}</span>
            </div>
          ))}
        </motion.div>

        <motion.p
          className="ai-note"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <ShieldCheck size={16} color="var(--accent)" aria-hidden />
          You always stay in control. Jass AI suggestions can be edited, replaced, or ignored.
          Cloud AI features connect seamlessly; core planning works locally offline.
        </motion.p>
      </div>
    </section>
  );
}
