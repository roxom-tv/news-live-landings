import Link from "next/link";
import { listLandings } from "@/lib/db";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function LandingsIndexPage() {
  const landings = listLandings(100);

  return (
    <main className={styles.index}>
      <section className={styles.hero}>
        <p>News Landing Pipeline</p>
        <h1>Live landings generated from Telegram</h1>
        <span>Final URLs publish under /landings/[landingname]</span>
      </section>

      <section className={styles.grid}>
        {landings.length === 0 ? (
          <div className={styles.empty}>
            <h2>No landings yet</h2>
            <p>Send /start_live &lt;topic&gt; from Telegram to create the first live landing.</p>
          </div>
        ) : (
          landings.map(landing => (
            <Link className={styles.card} href={`/landings/${landing.slug}`} key={landing.slug}>
              <span>{landing.status}</span>
              <h2>{landing.content.headline}</h2>
              <p>{landing.content.summary}</p>
              <small>{landing.finalUrl}</small>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
