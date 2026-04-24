import Link from "next/link";
import { isAutoRefreshEnabled, listLandings, summarizeAllTokenUsage } from "@/lib/db";
import { env } from "@/lib/config";
import { AutoRefreshToggle } from "./AutoRefreshToggle";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const numberFormat = new Intl.NumberFormat("en-US");

const compactDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

const heroImageFrom = (landing: ReturnType<typeof listLandings>[number]) =>
  landing.content.visuals.find(visual => visual.type === "image" && visual.url)?.url;

const imageProxyUrl = (url: string) => `/landings/api/source-image?url=${encodeURIComponent(url)}`;

const relativeTime = (date: Date) => {
  const diffMs = date.getTime() - Date.now();
  const absMinutes = Math.max(0, Math.round(Math.abs(diffMs) / 60000));
  if (absMinutes < 1) return diffMs >= 0 ? "now" : "just now";
  if (absMinutes < 60) return diffMs >= 0 ? `in ${absMinutes}m` : `${absMinutes}m ago`;
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const label = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return diffMs >= 0 ? `in ${label}` : `${label} ago`;
};

export default function LandingsIndexPage() {
  const allLandings = listLandings(100);
  const liveLandings = allLandings.filter(landing => landing.status === "live");
  const tokenUsage = summarizeAllTokenUsage();
  const latest = liveLandings[0];
  const autoRefreshEnabled = isAutoRefreshEnabled();
  const lastCycleAt = liveLandings
    .map(landing => landing.lastCycleAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const intervalMinutes = env.liveCycleMinutes;
  const nextCycleAt = lastCycleAt ? new Date(new Date(lastCycleAt).getTime() + intervalMinutes * 60 * 1000) : null;
  const canManageAutoRefresh = !env.adminToken && env.pipelineEnv !== "prod";

  return (
    <main className={styles.index}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Live News Landing Pipeline</p>
          <h1>Published stories, token spend, and live output.</h1>
          <span>Send a topic from Telegram or mention the bot in Slack. The system researches, writes, designs, reviews, and publishes here.</span>
        </div>
        <div className={styles.metrics} aria-label="Pipeline metrics">
          <div>
            <span>Total Tokens</span>
            <strong>{numberFormat.format(tokenUsage.totalTokens)}</strong>
          </div>
          <div>
            <span>Input</span>
            <strong>{numberFormat.format(tokenUsage.inputTokens)}</strong>
          </div>
          <div>
            <span>Output</span>
            <strong>{numberFormat.format(tokenUsage.outputTokens)}</strong>
          </div>
          <div>
            <span>Agent Runs</span>
            <strong>{numberFormat.format(tokenUsage.runs)}</strong>
          </div>
        </div>
      </section>

      <section className={styles.overview} aria-label="Publishing overview">
        <div>
          <span>Live</span>
          <strong>{liveLandings.length}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{allLandings.length}</strong>
        </div>
        <div>
          <span>Last Update</span>
          <strong>{latest ? compactDate(latest.updatedAt) : "None"}</strong>
        </div>
      </section>

      <section className={styles.monitor} aria-label="Live update monitor">
        <div>
          <p className={styles.kicker}>Update Monitor</p>
          <h2>
            {autoRefreshEnabled
              ? `Live agent checks for material updates every ${intervalMinutes} minutes.`
              : "Automatic update checks are currently disabled."}
          </h2>
          <span>Operator channels only receive a message when an update is actually published.</span>
          {canManageAutoRefresh ? (
            <AutoRefreshToggle initialEnabled={autoRefreshEnabled} />
          ) : (
            <small className={styles.monitorHint}>Auto-refresh control is restricted to authenticated admin requests.</small>
          )}
        </div>
        <div className={styles.monitorStats}>
          <div>
            <span>Last Check</span>
            <strong>{lastCycleAt ? relativeTime(new Date(lastCycleAt)) : "Not yet"}</strong>
            {lastCycleAt && <small>{compactDate(lastCycleAt)}</small>}
          </div>
          <div>
            <span>Next Estimated Check</span>
            <strong>{nextCycleAt ? relativeTime(nextCycleAt) : "Waiting"}</strong>
            {nextCycleAt && <small>{compactDate(nextCycleAt.toISOString())}</small>}
          </div>
          <div>
            <span>Interval</span>
            <strong>{intervalMinutes}m</strong>
            <small>Configured live cycle</small>
          </div>
        </div>
      </section>

      {latest && (
        <section className={styles.featured}>
          <div className={styles.featuredCopy}>
            <p className={styles.kicker}>Latest Published</p>
            <h2>{latest.content.headline}</h2>
            <p>{latest.content.subheadline || latest.content.summary}</p>
            <Link href={`/landings/${latest.slug}`}>Read latest story</Link>
          </div>
          {heroImageFrom(latest) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageProxyUrl(heroImageFrom(latest) ?? "")} alt={latest.content.headline} />
          )}
        </section>
      )}

      <section className={styles.sectionHeader}>
        <p className={styles.kicker}>Archive</p>
        <h2>All live pages</h2>
      </section>

      <section className={styles.grid}>
        {liveLandings.length === 0 ? (
          <div className={styles.empty}>
            <h2>No landings yet</h2>
            <p>Send a topic from Telegram or Slack to create the first live landing.</p>
          </div>
        ) : (
          liveLandings.map(landing => {
            const imageUrl = heroImageFrom(landing);
            return (
              <Link className={styles.card} href={`/landings/${landing.slug}`} key={landing.slug}>
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageProxyUrl(imageUrl)} alt={landing.content.headline} />
                )}
                <div>
                  <span>{landing.status}</span>
                  <h3>{landing.content.headline}</h3>
                  <p>{landing.content.summary}</p>
                  <small>{landing.content.sources.length} sources · {compactDate(landing.updatedAt)}</small>
                </div>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
