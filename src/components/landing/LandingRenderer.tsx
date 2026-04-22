"use client";

/* eslint-disable @next/next/no-img-element -- News images come from arbitrary source domains discovered at runtime. */
import { motion } from "framer-motion";
import type { LandingContent, StorySection, VisualAsset } from "@/lib/types";
import styles from "./landing.module.css";

const imageProxyUrl = (url: string) => `/landings/api/source-image?url=${encodeURIComponent(url)}`;

const sourceLabel = (content: LandingContent, sourceUrl: string) => {
  const source = content.sources.find(item => item.url === sourceUrl);
  return source ? source.outlet : "Source";
};

const sectionDateLabel = (section: StorySection, index: number) => {
  const match = section.body.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{4}\b/i);
  return match?.[0] ?? `Step ${index + 1}`;
};

const contextHeading = (content: LandingContent) => {
  switch (content.designSpec?.layout) {
    case "market-brief":
    case "data-dashboard":
      return "Signals & Data";
    case "person-profile":
      return "Profile Timeline";
    case "competition-brief":
      return "Status & Stakes";
    case "election-brief":
      return "Results & Outcomes";
    case "event-brief":
    case "timeline":
      return "Facts Timeline";
    default:
      return "Key Facts";
  }
};

const termsFor = (text: string) => text.toLowerCase().split(/\W+/).filter(term => term.length > 3);

const visualMatchesSection = (visual: VisualAsset | undefined, section: StorySection, content: LandingContent) => {
  if (!visual) return false;
  if (visual.relevance === "direct") return true;
  const visualText = termsFor(`${visual.title} ${visual.alt} ${visual.relevanceReason ?? ""}`);
  const sectionText = new Set(termsFor(`${section.title} ${section.body} ${content.topic}`));
  return visualText.some(term => sectionText.has(term));
};

const chooseSectionImage = (
  images: Array<VisualAsset & { url: string }>,
  section: StorySection,
  content: LandingContent,
  index: number
) => {
  if (images.length === 0) return undefined;
  return images.find(image => visualMatchesSection(image, section, content)) ?? (section.visualHint === "image" ? images[index % images.length] : undefined);
};

function SectionMedia({ section, visual, index }: { section: StorySection; visual?: VisualAsset; index: number }) {
  if (visual?.type === "image" && visual.url) {
    return (
      <figure className={styles.articleImageBlock}>
        <img src={imageProxyUrl(visual.url)} alt={visual.alt} loading={index === 0 ? "eager" : "lazy"} />
        <figcaption>{visual.credit}</figcaption>
      </figure>
    );
  }

  if (section.visualHint === "chart" || section.visualHint === "data") {
    const bars = [64, 42, 88, 58, 76].map(value => Math.max(16, Math.min(94, value + index * 2)));
    return (
      <div className={styles.chartCard} aria-label="Data visual">
        <div className={styles.chartBars}>
          {bars.map((height, barIndex) => (
            <span style={{ height: `${height}%` }} key={`${height}-${barIndex}`} />
          ))}
        </div>
      </div>
    );
  }

  if (section.visualHint === "map") {
    return (
      <div className={styles.mapCard} aria-label="Location visual">
        <span />
        <span />
        <span />
      </div>
    );
  }

  return null;
}

export function LandingRenderer({ content }: { content: LandingContent }) {
  const imageVisuals = content.visuals.filter((visual): visual is VisualAsset & { url: string } => (
    visual.type === "image" && Boolean(visual.url)
  ));
  const heroImage = imageVisuals[0];
  const articleImages = imageVisuals.slice(1);
  const heroTags = [content.designSpec?.layout?.replace("-", " "), content.topic].filter(Boolean).slice(0, 2);

  return (
    <main className={styles.shell} data-layout={content.designSpec?.layout ?? "visual-cover"}>
      <nav className={styles.navbar} aria-label="Landing navigation">
        <span className={styles.brand}>Live News</span>
      </nav>

      <section className={styles.hero} aria-label="Lead story">
        {heroImage && (
          <img className={styles.heroImage} src={imageProxyUrl(heroImage.url)} alt={heroImage.alt} fetchPriority="high" />
        )}
        <div className={styles.heroGradient} aria-hidden="true" />
        <div className={styles.heroScan} aria-hidden="true" />
        <motion.div
          className={styles.heroContent}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className={styles.heroEyebrow}>
            <span className={styles.breakingBadge}><span aria-hidden="true" />Live</span>
            {heroTags.map(tag => <span className={styles.heroTag} key={tag}>{tag}</span>)}
            <span className={styles.heroDate}>{new Date(content.lastUpdatedUtc).toLocaleString()}</span>
          </div>
          <h1 className={styles.heroHeadline}>{content.headline}</h1>
          <p className={styles.heroSubheadline}>{content.subheadline}</p>
          {heroImage && <p className={styles.heroCredit}>Image: {heroImage.credit}</p>}
        </motion.div>
      </section>

      <section className={styles.articleSection} aria-label="Main article">
        <div className={styles.container}>
          <div className={styles.sectionLabel}>
            <span>The Story</span>
            <i aria-hidden="true" />
          </div>
          <article className={styles.articleBody}>
            <p className={styles.lede}>{content.summary}</p>
            {content.sections.map((section, index) => {
              const visual = chooseSectionImage(articleImages, section, content, index);
              const shouldShowMedia = Boolean(visual) && (index === 1 || index === 3 || section.visualHint === "image");
              return (
                <motion.section
                  className={styles.articleChunk}
                  key={section.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.45 }}
                >
                  <h2>{section.title}</h2>
                  <p>{section.body}</p>
                  <div className={styles.sourceTags} aria-label="Sources for this section">
                    {section.sourceUrls.map((sourceUrl, sourceIndex) => (
                      <a href={sourceUrl} target="_blank" rel="noreferrer" key={sourceUrl}>
                        {sourceLabel(content, sourceUrl)} {sourceIndex + 1}
                      </a>
                    ))}
                  </div>
                  {shouldShowMedia && <SectionMedia section={section} visual={visual} index={index} />}
                </motion.section>
              );
            })}
          </article>
        </div>
      </section>

      <section className={styles.contextSection} aria-label="Timeline">
        <div className={styles.container}>
          <div className={styles.sectionLabel}>
            <span>{contextHeading(content)}</span>
            <i aria-hidden="true" />
          </div>
          <ol className={styles.timeline}>
            {content.sections.slice(0, 8).map((section, index) => (
              <li className={styles.timelineItem} key={section.id}>
                <span className={styles.timelineDate}>{sectionDateLabel(section, index)}</span>
                <span className={styles.timelineDot} aria-hidden="true" />
                <div>
                  <p>{section.body}</p>
                  <small>{section.sourceUrls.map(sourceUrl => sourceLabel(content, sourceUrl)).join(" · ")}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {content.quotes.length > 0 && (
        <section className={styles.quotesSection} aria-label="Key quotes">
          <div className={styles.containerWide}>
            <div className={styles.sectionLabel}>
              <span>Key Quotes</span>
              <i aria-hidden="true" />
            </div>
            <div className={styles.quotesGrid}>
              {content.quotes.slice(0, 6).map(quote => (
                <blockquote className={styles.quoteCard} key={quote.quote}>
                  <span aria-hidden="true">&ldquo;</span>
                  <p>{quote.quote}</p>
                  <footer>
                    <strong>{quote.attribution}</strong>
                    <a href={quote.sourceUrl} target="_blank" rel="noreferrer">{sourceLabel(content, quote.sourceUrl)}</a>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className={styles.dataSection} aria-label="Data and impact">
        <div className={styles.containerWide}>
          <div className={styles.sectionLabel}>
            <span>Data & Impact</span>
            <i aria-hidden="true" />
          </div>
          <div className={styles.statGrid}>
            {content.dataPoints.slice(0, 8).map(point => (
              <a className={styles.statCard} href={point.sourceUrl} target="_blank" rel="noreferrer" key={`${point.label}-${point.value}`}>
                <span>{point.label}</span>
                <strong>{point.value}</strong>
                <p>{point.context}</p>
                <small>{sourceLabel(content, point.sourceUrl)}</small>
              </a>
            ))}
          </div>
          {content.dataPoints.length >= 2 && (
            <div className={styles.chartWrapper}>
              <p>Data from the story</p>
              <small>{content.dataPoints.slice(0, 3).map(point => point.label).join(" · ")}</small>
              <div className={styles.sourceChart} aria-label="Chart based on sourced data points">
                {content.dataPoints.slice(0, 5).map(point => (
                  <span
                    key={`${point.label}-${point.value}`}
                    title={`${point.label}: ${point.value}`}
                    style={{ height: `${Math.min(96, Math.max(20, point.value.length * 6))}%` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={styles.reactionsSection} aria-label="Reactions and perspectives">
        <div className={styles.containerWide}>
          <div className={styles.sectionLabel}>
            <span>Reactions</span>
            <i aria-hidden="true" />
          </div>
          <div className={styles.reactionsGrid}>
            {content.sources.slice(0, 6).map(source => (
              <a className={styles.reactionCard} href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                <span aria-hidden="true">{source.outlet.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{source.outlet}</strong>
                  <small>{source.credibility}</small>
                </div>
                <p>{source.title}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {imageVisuals.length > 1 && (
        <section className={styles.gallerySection} aria-label="Image gallery">
          <div className={styles.containerWide}>
            <div className={styles.sectionLabel}>
              <span>Images</span>
              <i aria-hidden="true" />
            </div>
            <div className={styles.galleryGrid}>
              {imageVisuals.slice(0, 8).map(visual => (
                <figure className={styles.galleryItem} key={visual.url}>
                  <img src={imageProxyUrl(visual.url)} alt={visual.alt} loading="lazy" />
                  <figcaption>{visual.credit}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {content.updateHistory.length > 0 && (
        <section className={styles.updates}>
          <div className={styles.container}>
            <div className={styles.sectionLabel}>
              <span>Live Update History</span>
              <i aria-hidden="true" />
            </div>
            {content.updateHistory.slice(0, 5).map(update => (
              <div key={`${update.timestampUtc}-${update.summary}`}>
                <strong>{update.materiality}</strong>
                <p>{update.summary}</p>
                <span>{new Date(update.timestampUtc).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.sourcesSection} aria-label="Sources">
        <div className={styles.containerWide}>
          <div className={styles.sectionLabel}>
            <span>Sources</span>
            <i aria-hidden="true" />
          </div>
          <div className={styles.sourcesIntro}>
            <p>
              This landing is built from source-bound reporting. Each article section links to the sources
              used for its claims; the full source list is collected here for review.
            </p>
            <span>{content.sources.length} sources · Updated {new Date(content.lastUpdatedUtc).toLocaleString()}</span>
          </div>
          <ol className={styles.sourcesList}>
            {content.sources.map((source, index) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{source.title}</strong>
                  <small>
                    {source.outlet}
                    {source.publishedAt ? ` · ${source.publishedAt}` : ""}
                    {source.credibility ? ` · ${source.credibility}` : ""}
                  </small>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          <strong>Live News Landings</strong> · Updated {new Date(content.lastUpdatedUtc).toLocaleString()} ·{" "}
          {content.sections.length} story sections · {content.dataPoints.length} sourced data points
        </p>
      </footer>
    </main>
  );
}
