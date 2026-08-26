import { GITHUB_URL } from "../data/downloads";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/images/logo/logo-64.png" alt="StudyFlow AI" width={28} height={28} style={{ borderRadius: 6, display: "block" }} />
          <div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
              StudyFlow <span className="muted">AI</span>
            </span>
            <p className="footer-copy" style={{ marginTop: 2 }}>
              © {new Date().getFullYear()} StudyFlow AI
            </p>
          </div>
        </div>
        <nav aria-label="Footer">
          <ul className="footer-links">
            <li><a href="#product">Product</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#download">Download</a></li>
            <li><a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">GitHub</a></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
