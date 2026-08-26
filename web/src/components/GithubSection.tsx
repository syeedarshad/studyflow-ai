import { Github as GithubIcon } from "lucide-react";
import { GITHUB_URL } from "../data/downloads";

export default function GithubSection() {
  return (
    <section className="github" id="github" aria-label="Open source repository">
      <div className="container">
        <h2>Built in the open.</h2>
        <p>
          StudyFlow AI is developed publicly. Browse the source, report issues,
          or follow along as it grows.
        </p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-ghost"
        >
          <GithubIcon size={17} aria-hidden /> View on GitHub
        </a>
      </div>
    </section>
  );
}
