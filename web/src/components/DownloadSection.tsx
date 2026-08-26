import { Download } from "lucide-react";
import { downloads, RELEASE_NOTES_URL } from "../data/downloads";

export default function DownloadSection() {
  return (
    <section className="download" id="download" aria-label="Download StudyFlow AI">
      <div className="container">
        <div className="download-header">
          <p className="eyebrow">Download</p>
          <h2>Built for your desktop.</h2>
          <p className="download-sub">
            Choose the build that best fits your workflow.
          </p>
        </div>

        <div className="dl-container">
          <div className="dl-grid">
            {downloads.map((d) => {
              const isRecommended = Boolean(d.recommended);
              const isAvailable = Boolean(d.available);

              return (
                <article
                  key={d.id}
                  className={`dl-card ${isRecommended ? "dl-card-recommended" : ""} ${
                    !isAvailable ? "dl-card-disabled" : ""
                  }`}
                >
                  <div className="dl-card-header">
                    <div className="dl-card-title-row">
                      <h3 className="dl-card-title">{d.title}</h3>
                      {isRecommended && <span className="dl-badge">RECOMMENDED</span>}
                    </div>
                    <p className="dl-card-desc">{d.description}</p>
                  </div>

                  <div className="dl-card-footer">
                    <div className="dl-meta" aria-label={`${d.title} ${d.meta}`}>
                      <span>{d.meta}</span>
                    </div>

                    {isAvailable && d.url ? (
                      <a
                        href={d.url}
                        className={`btn ${isRecommended ? "btn-primary" : "btn-secondary"} dl-btn`}
                        download
                      >
                        <Download size={15} aria-hidden /> {d.buttonLabel}
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-disabled dl-btn"
                        disabled
                        aria-disabled="true"
                      >
                        {d.buttonLabel}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <p className="dl-notes">
          Release notes and all versions:{" "}
          <a href={RELEASE_NOTES_URL} target="_blank" rel="noreferrer noopener">
            GitHub Releases
          </a>
        </p>
      </div>
    </section>
  );
}
