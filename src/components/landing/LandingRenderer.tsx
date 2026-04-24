"use client";

/* eslint-disable @next/next/no-img-element -- News images come from arbitrary source domains discovered at runtime. */
import { motion } from "framer-motion";
import type { LandingContent, StorySection, VisualAsset } from "@/lib/types";
import styles from "./landing.module.css";

const imageProxyUrl = (url: string) => `/landings/api/source-image?url=${encodeURIComponent(url)}`;

const normalizeVisualKey = (visual: Pick<VisualAsset, "url" | "title" | "credit"> & { url?: string }) => {
  const normalizedUrl = String(visual.url ?? "")
    .replace(/^https?:\/\/[^/]+\/landings\/api\/source-image\?url=/, "")
    .replace(/^https?:\/\/[^/]+\/api\/source-image\?url=/, "");
  const safeTitle = String(visual.title ?? "").trim().toLowerCase();
  const safeCredit = String(visual.credit ?? "").trim().toLowerCase();
  try {
    return `${decodeURIComponent(normalizedUrl)}|${safeTitle}|${safeCredit}`;
  } catch {
    return `${normalizedUrl}|${safeTitle}|${safeCredit}`;
  }
};

const trimSentenceExcerpt = (text: string, maxLength = 220) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentences = normalized.match(/[^.!?]+[.!?]+/g);
  const excerpt = sentences?.slice(0, 2).join(" ").trim() ?? normalized;
  return excerpt.length > maxLength ? `${excerpt.slice(0, maxLength - 3).trim()}...` : excerpt;
};

const termsFor = (text: string) => text.toLowerCase().split(/\W+/).filter(term => term.length > 3);

const visualMatchesSection = (visual: VisualAsset | undefined, section: StorySection, content: LandingContent) => {
  if (!visual) return false;
  if (visual.relevance === "direct") return true;
  const visualText = termsFor(`${visual.title} ${visual.alt} ${visual.relevanceReason ?? ""}`);
  const sectionText = new Set(termsFor(`${section.title} ${section.body} ${content.topic}`));
  return visualText.some(term => sectionText.has(term));
};

const extractPointNumbers = (value: string) => {
  const matches = Array.from(value.matchAll(/(\d[\d.,]*)/g));
  return matches
    .map(match => Number(match[1].replace(/,/g, "")))
    .filter(number => Number.isFinite(number));
};

const pointMagnitude = (value: string) => {
  const numbers = extractPointNumbers(value);
  if (numbers.length === 0) return 0;
  return numbers.length > 1 ? numbers.reduce((sum, number) => sum + number, 0) : numbers[0];
};

const chartTone = (index: number) => (["var(--primary)", "var(--tertiary)", "var(--secondary)", "#ffd36f"])[index % 4];

const tickerIcon = (label: string) => {
  const normalized = label.toLowerCase();
  if (normalized.includes("critical") || normalized.includes("blocker")) return "▲";
  if (normalized.includes("important")) return "■";
  if (normalized.includes("minor")) return "●";
  return "◆";
};

const buildSectionChartPoints = (content: LandingContent, index: number) => {
  if (content.dataPoints.length === 0) return [];
  const rotated = content.dataPoints.map((_, offset) => content.dataPoints[(index + offset) % content.dataPoints.length]);
  return rotated.slice(0, Math.min(3, rotated.length));
};

function SectionMedia({
  section,
  visual,
  index,
  content
}: {
  section: StorySection;
  visual?: VisualAsset;
  index: number;
  content: LandingContent;
}) {
  if (visual?.type === "image" && visual.url) {
    return (
      <figure className={styles.articleImageBlock}>
        <img src={imageProxyUrl(visual.url)} alt={visual.alt} loading={index === 0 ? "eager" : "lazy"} />
        <figcaption>{visual.credit}</figcaption>
      </figure>
    );
  }

  if (section.visualHint === "chart" || section.visualHint === "data") {
    const points = buildSectionChartPoints(content, index);
    const maxMagnitude = Math.max(...points.map(point => pointMagnitude(point.value)), 1);
    return (
      <div className={styles.chartCard} aria-label="Data visual">
        <div className={styles.chartCardHeader}>
          <strong>{section.title}</strong>
          <span>Story comparison</span>
        </div>
        <div className={styles.chartRows}>
          {points.map((point, pointIndex) => {
            const magnitude = pointMagnitude(point.value);
            return (
              <div
                key={`${point.label}-${point.value}`}
                className={styles.chartRow}
              >
                <div className={styles.chartRowCopy}>
                  <strong>{point.label}</strong>
                  <small>{point.context}</small>
                </div>
                <div className={styles.chartTrack}>
                  <span
                    className={styles.chartFill}
                    style={{
                      width: `${Math.max(24, Math.round((magnitude / maxMagnitude) * 100))}%`,
                      background: `linear-gradient(90deg, ${chartTone(pointIndex)}, rgba(255,255,255,0.18))`
                    }}
                  >
                    {point.value}
                  </span>
                </div>
              </div>
            );
          })}
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
  const imageVisuals = content.visuals
    .filter((visual): visual is VisualAsset & { url: string } => (
      visual.type === "image" && Boolean(visual.url)
    ))
    .filter((visual, index, all) => index === all.findIndex(item => normalizeVisualKey(item) === normalizeVisualKey(visual)));
  const heroImage = imageVisuals[0];
  const articleImages = imageVisuals.slice(1);
  const heroTags = [content.designSpec?.layout?.replace("-", " "), content.topic].filter(Boolean).slice(0, 2);
  const storyMapSections = content.sections.slice(0, 5);
  const visibleUpdates = content.updateHistory.filter(update => !/fallback|repair|critic/i.test(update.summary));
  const explainerPoints = content.dataPoints.slice(0, 5);
  const metricCards = content.dataPoints.slice(0, 4);
  const availableSectionImages = [...articleImages];
  const sectionImagePlan = content.sections.map((section, index) => {
    const shouldPrioritizeImage = index === 0 || section.visualHint === "image" || index % 2 === 1;
    const matchedIndex = availableSectionImages.findIndex(image => visualMatchesSection(image, section, content));
    const fallbackIndex = shouldPrioritizeImage && availableSectionImages.length > 0 ? 0 : -1;
    const chosenIndex = matchedIndex >= 0 ? matchedIndex : fallbackIndex;
    const visual = chosenIndex >= 0 ? availableSectionImages.splice(chosenIndex, 1)[0] : undefined;
    const isLeadSection = index === 0;
    const shouldShowMedia = Boolean(visual);
    return { section, index, visual, isLeadSection, shouldShowMedia };
  });
  const usedArticleImageUrls = new Set<string>();
  sectionImagePlan
    .filter(item => item.shouldShowMedia && item.visual?.url)
    .forEach(item => usedArticleImageUrls.add(item.visual!.url));
  const galleryVisuals = imageVisuals
    .slice(1)
    .filter(visual => !usedArticleImageUrls.has(visual.url))
    .slice(0, 6);
  const dataMagnitudes = explainerPoints.map(point => ({
    ...point,
    magnitude: pointMagnitude(point.value)
  }));
  const maxDataMagnitude = Math.max(...dataMagnitudes.map(point => point.magnitude), 1);
  const liveFeedItems = (visibleUpdates.length > 0
    ? visibleUpdates.slice(0, 4).map(update => ({
        label: update.materiality,
        time: new Date(update.timestampUtc).toLocaleString(),
        body: trimSentenceExcerpt(update.summary, 140)
      }))
    : content.sections.slice(0, 4).map((section, index) => ({
        label: section.eyebrow,
        time: index === 0 ? "Current brief" : `Section ${String(index + 1).padStart(2, "0")}`,
        body: trimSentenceExcerpt(section.body, 140)
      })));
  const tickerItems = (liveFeedItems.length > 0 ? liveFeedItems : content.sections.slice(0, 3).map(section => ({
    label: section.eyebrow,
    body: trimSentenceExcerpt(section.title, 96)
  }))).slice(0, 4);
  const navSections = storyMapSections.slice(0, 4);
  const railSections = content.sections.slice(0, 8);
  const leadMetric = metricCards[0];
  const secondaryMetric = metricCards[1];

  return (
    <main className={styles.shell} data-layout={content.designSpec?.layout ?? "visual-cover"}>
      <div className={styles.topTicker} aria-label="Live alert ticker">
        <div className={styles.topTickerTrack}>
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <div key={`${item.label}-${index}`} className={styles.topTickerItem}>
              <span>{tickerIcon(item.label)}</span>
              <strong>{item.label}</strong>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      <nav className={styles.navbar} aria-label="Landing navigation">
        <span className={styles.brand}>{String(content.topic ?? "Live News").slice(0, 36)}</span>
        <div className={styles.navLinks}>
          {navSections.map(section => (
            <a href={`#${section.id}`} key={section.id}>{section.eyebrow}</a>
          ))}
        </div>
        <div className={styles.navActions} aria-label="Story utilities">
          <span>Live</span>
          <span>{new Date(content.lastUpdatedUtc).toLocaleDateString()}</span>
        </div>
      </nav>
      <div className={styles.commandDeck}>
        <aside className={styles.commandRail} aria-label="Story command rail">
          <div className={styles.commandRailHeader}>
            <strong>Command Center</strong>
            <span>Story navigation</span>
          </div>
          <nav className={styles.commandRailNav}>
            {railSections.map(section => (
              <a href={`#${section.id}`} key={section.id}>
                <span>{section.eyebrow}</span>
                <strong>{section.title}</strong>
              </a>
            ))}
          </nav>
          <div className={styles.commandRailFooter}>
            <a href="#sources">Audit sources</a>
            <a href="#lead">Jump to lead</a>
          </div>
        </aside>

        <div className={styles.canvas}>
          <section className={styles.hero} aria-label="Lead story">
            <div className={styles.heroGrid}>
              <div className={styles.heroMain}>
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
                <div className={styles.heroMetricStack}>
                  {leadMetric && (
                    <div className={styles.heroMetricCard}>
                      <span>{leadMetric.label}</span>
                      <strong>{leadMetric.value}</strong>
                      <small>{leadMetric.context}</small>
                    </div>
                  )}
                  {secondaryMetric && (
                    <div className={`${styles.heroMetricCard} ${styles.heroMetricCardAlt}`}>
                      <span>{secondaryMetric.label}</span>
                      <strong>{secondaryMetric.value}</strong>
                      <small>{secondaryMetric.context}</small>
                    </div>
                  )}
                </div>
              </div>

              <aside className={styles.liveFeed} aria-label="Live intelligence">
                <div className={styles.liveFeedHeader}>
                  <span>Live Intel</span>
                  <i aria-hidden="true" />
                </div>
                <div className={styles.liveFeedList}>
                  {liveFeedItems.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={styles.liveFeedItem}>
                      <small>{item.time}</small>
                      <strong>{item.label}</strong>
                      <p>{item.body}</p>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <section className={styles.topLineSection} aria-label="Top line">
            <div className={styles.containerWide}>
              <div className={styles.topLineGrid}>
                <div className={styles.topLineLead}>
                  <span>Top Line</span>
                  <p>{content.summary}</p>
                </div>
                <nav className={styles.storyMap} aria-label="Story sections">
                  {storyMapSections.map((section, index) => (
                    <a href={`#${section.id}`} key={section.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{section.title}</strong>
                    </a>
                  ))}
                </nav>
              </div>
            </div>
          </section>

          <section className={styles.articleSection} aria-label="Main article">
            <div className={styles.container}>
          <div className={styles.sectionLabel}>
            <span>The Story</span>
            <i aria-hidden="true" />
          </div>
          <article className={styles.articleBody}>
            {sectionImagePlan.map(({ section, index, visual, isLeadSection, shouldShowMedia }) => {
              return (
                <motion.section
                  className={`${styles.articleChunk} ${isLeadSection ? styles.articleLeadChunk : ""}`}
                  id={section.id}
                  key={section.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.45 }}
                >
                  <span className={styles.articleEyebrow}>{section.eyebrow}</span>
                  <h2>{section.title}</h2>
                  <p className={isLeadSection ? styles.articleLeadBody : undefined}>{section.body}</p>
                  {shouldShowMedia && <SectionMedia section={section} visual={visual} index={index} content={content} />}
                  {!shouldShowMedia && (section.visualHint === "chart" || section.visualHint === "data" || section.visualHint === "map") && (
                    <SectionMedia section={section} index={index} content={content} />
                  )}
                </motion.section>
              );
            })}
          </article>
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
              <div className={styles.statCard} key={`${point.label}-${point.value}`}>
                <span>{point.label}</span>
                <strong>{point.value}</strong>
                <p>{point.context}</p>
              </div>
            ))}
          </div>
          {content.dataPoints.length >= 2 && (
            <div className={styles.chartWrapper}>
              <p>Data in the story</p>
              <small>{content.dataPoints.slice(0, 3).map(point => point.label).join(" · ")}</small>
              <div className={styles.sourceChart} aria-label="Chart based on sourced data points">
                {dataMagnitudes.map((point, index) => (
                  <div key={`${point.label}-${point.value}`} className={styles.sourceChartRow}>
                    <div>
                      <strong>{point.label}</strong>
                      <small>{point.context}</small>
                    </div>
                    <span
                      style={{
                        width: `${Math.max(26, Math.round((point.magnitude / maxDataMagnitude) * 100))}%`,
                        background: `linear-gradient(90deg, ${chartTone(index)}, rgba(255,255,255,0.18))`
                      }}
                    >
                      {point.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            )}
            </div>
          </section>

      {galleryVisuals.length >= 2 && (
        <section className={styles.gallerySection} aria-label="Image gallery">
              <div className={styles.containerWide}>
            <div className={styles.sectionLabel}>
              <span>Images</span>
              <i aria-hidden="true" />
            </div>
              <div className={styles.galleryGrid}>
              {galleryVisuals.map(visual => (
                <figure className={styles.galleryItem} key={visual.url}>
                  <img src={imageProxyUrl(visual.url)} alt={visual.alt} loading="lazy" />
                  <figcaption>{visual.credit}</figcaption>
                </figure>
              ))}
            </div>
              </div>
            </section>
          )}

          {visibleUpdates.length > 0 && (
            <section className={styles.updates}>
              <div className={styles.container}>
            <div className={styles.sectionLabel}>
              <span>Live Update History</span>
              <i aria-hidden="true" />
            </div>
            {visibleUpdates.slice(0, 5).map(update => (
              <div key={`${update.timestampUtc}-${update.summary}`}>
                <strong>{update.materiality}</strong>
                <p>{update.summary}</p>
                <span>{new Date(update.timestampUtc).toLocaleString()}</span>
              </div>
            ))}
              </div>
            </section>
          )}

          <section className={styles.sourcesSection} aria-label="Sources" id="sources">
            <div className={styles.containerWide}>
          <div className={styles.sectionLabel}>
            <span>Sources</span>
            <i aria-hidden="true" />
          </div>
          <div className={styles.sourcesIntro}>
            <p>
              This is the full reading list behind the landing. Every external source link lives here so the story can read cleanly before you audit it.
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
        </div>
      </div>

      <footer className={styles.footer}>
        <p>
          <strong>Live News Landings</strong> · Updated {new Date(content.lastUpdatedUtc).toLocaleString()}
        </p>
      </footer>

      <nav className={styles.mobileDock} aria-label="Mobile story navigation">
        {navSections.map(section => (
          <a href={`#${section.id}`} key={`mobile-${section.id}`}>
            <span>{section.eyebrow}</span>
          </a>
        ))}
      </nav>
    </main>
  );
}
