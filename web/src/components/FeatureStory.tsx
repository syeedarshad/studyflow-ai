import { motion } from "framer-motion";

interface Feature {
  index: string;
  title: [string, string];
  copy: string;
  image: string;
  alt: string;
  flip?: boolean;
}

const FEATURES: Feature[] = [
  {
    index: "01",
    title: ["Plan the work.", "Then start."],
    copy: "Describe what you need to achieve. Jass AI turns it into a structured, actionable plan — broken into sessions you can actually complete.",
    image: "/images/screenshots/ai-planning.png",
    alt: "Jass AI study planner generating a structured multi-week study plan",
  },
  {
    index: "02",
    title: ["A schedule that", "respects your time."],
    copy: "Sessions are organized around your availability. Smart timeblocking keeps your week realistic instead of overflowing.",
    image: "/images/screenshots/scheduling.png",
    alt: "Smart timeblocking view with study sessions laid out across the week",
    flip: true,
  },
  {
    index: "03",
    title: ["Daily tasks,", "connected to goals."],
    copy: "Every task traces back to a larger goal. You always know why today's work matters and where you are headed.",
    image: "/images/screenshots/goals-tasks.png",
    alt: "Goals and tasks view linking daily tasks to long-term goals",
  },
  {
    index: "04",
    title: ["Roadmaps for", "the long run."],
    copy: "Visual milestones mapped across semesters and career goals — so progress stays clear even across long timelines.",
    image: "/images/screenshots/roadmaps.png",
    alt: "Career and semester roadmap view showing milestones and progression",
    flip: true,
  },
  {
    index: "05",
    title: ["See your", "consistency."],
    copy: "Progress and analytics show focus streaks, completion trends, and subject distribution — honest numbers, no fluff.",
    image: "/images/screenshots/analytics.png",
    alt: "Analytics dashboard showing study consistency and progress trends",
  },
  {
    index: "06",
    title: ["Focus mode,", "online & offline."],
    copy: "Built-in Pomodoro timers, ambient soundscapes, and local study tracking keep you locked in anywhere.",
    image: "/images/screenshots/focus-mode.png",
    alt: "StudyFlow AI focus mode with ambient timer and study session tracker",
    flip: true,
  },
];

export default function FeatureStory() {
  return (
    <section id="features" aria-label="Features">
      <div className="container">
        {FEATURES.map((f) => (
          <article className={`feature ${f.flip ? "flip" : ""}`} key={f.index}>
            <div className="feature-copy">
              <motion.span
                className="section-index"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-80px" }}
              >
                {f.index}
              </motion.span>
              <motion.h3
                initial={{ opacity: 0, y: 24, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                {f.title[0]}
                <br />
                <span className="dim" style={{ color: "var(--text-faint)" }}>{f.title[1]}</span>
             </motion.h3>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                {f.copy}
              </motion.p>
            </div>
            <motion.div
              className="feature-visual"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <img src={f.image} alt={f.alt} loading="lazy" />
            </motion.div>
          </article>
        ))}
      </div>
    </section>
  );
}
