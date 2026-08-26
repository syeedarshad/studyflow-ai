import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { GITHUB_URL } from "../data/downloads";

const LINKS = [
  { label: "Product", href: "#product", external: false },
  { label: "Features", href: "#features", external: false },
  { label: "Download", href: "#download", external: false },
  { label: "GitHub", href: GITHUB_URL, external: true },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav ${scrolled ? "scrolled" : ""}`}>
      <div className="container nav-inner">
        <a href="#top" aria-label="StudyFlow AI home" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/images/logo/logo-64.png" alt="StudyFlow AI" width={28} height={28} style={{ borderRadius: 6, display: "block" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16 }}>
            StudyFlow <span className="muted">AI</span>
          </span>
        </a>
        <nav aria-label="Main">
          <ul className="nav-links">
            {LINKS.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  {...(l.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a href="#download" className="btn btn-primary nav-cta">
          <Download size={15} aria-hidden /> Download
        </a>
      </div>
    </header>
  );
}
