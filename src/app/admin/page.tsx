import { AdminAgentEditor } from "./AdminAgentEditor";
import styles from "./admin.module.css";
import { listEditableEntries } from "@/lib/admin-agents";
import { env } from "@/lib/config";
import { getPipelineConfig } from "@/lib/pipeline-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPage() {
  const hasAccess = !env.adminToken && env.pipelineEnv !== "prod";
  const initialAgents = hasAccess ? await listEditableEntries() : [];
  const initialFlows = hasAccess ? getPipelineConfig() : [];
  return (
    <main className={styles.admin}>
      <header className={styles.hero}>
        <div className={styles.heroEyebrowRow}>
          <p>Admin Backend</p>
          <span className={styles.heroStatus}>{hasAccess ? "Open in local mode" : "Token required"}</span>
        </div>
        <h1>Control prompts, flow order, and live pipeline behavior from one screen.</h1>
        <span>
          Runtime Markdown, shared system prompts, and stage ordering are loaded from disk and applied to new runs immediately. This screen is for operational editing, not just prompt storage.
        </span>
      </header>
      <AdminAgentEditor initialToken="" initialAgents={initialAgents} initialFlows={initialFlows} />
    </main>
  );
}
