import { useEffect, useRef, useState } from "react";

const STEPS = [
  { key: "PLAN", image: "/images/screenshots/ai-planning.png", alt: "Plan stage — structured study plan", copy: "Turn any goal or syllabus into a concrete, ordered plan with Jass AI." },
  { key: "FOCUS", image: "/images/screenshots/focus-mode.png", alt: "Focus stage — scheduled study sessions", copy: "Work through scheduled deep-focus sessions with ambient soundscapes." },
  { key: "TRACK", image: "/images/screenshots/analytics.png", alt: "Track stage — progress analytics", copy: "Every completed session is automatically recorded into your analytics." },
  { key: "IMPROVE", image: "/images/screenshots/goals-tasks.png", alt: "Improve stage — adjusted goals and tasks", copy: "Review your streaks, adapt roadmaps, and level up your study habit." },
];

export default function WorkflowSection() {
  const [active, setActive] = useState(0);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.idx);
            setActive(idx);
          }
        }
      },
      { rootMargin: "-40% 0px -40% 0px" }
    );
    panelRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="workflow" aria-label="How StudyFlow works">
      <div className="container">
        <p className="eyebrow">The flow</p>
        <div className="workflow-layout">
          <div className="workflow-steps" role="list">
            {STEPS.map((s, i) => (
              <div
                role="listitem"
                key={s.key}
                className={`wf-step ${active === i ? "active" : ""}`}
                aria-current={active === i ? "step" : undefined}
              >
                {s.key}
              </div>
            ))}
          </div>
          <div className="wf-panels">
            {STEPS.map((s, i) => (
              <div
                className="wf-panel"
                key={s.key}
                data-idx={i}
                ref={(el) => {
                  panelRefs.current[i] = el;
                }}
              >
                <img src={s.image} alt={s.alt} loading="lazy" />
                <p>{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
