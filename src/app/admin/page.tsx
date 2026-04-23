import { AdminAgentEditor } from "./AdminAgentEditor";
import styles from "./admin.module.css";
import { listEditableAgents } from "@/lib/admin-agents";
import { env } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminPageProps = {
  searchParams?: Promise<{ token?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const token = params?.token ?? "";
  const hasAccess = env.adminToken ? token === env.adminToken : env.pipelineEnv !== "prod";
  const initialAgents = hasAccess ? await listEditableAgents() : [];
  return (
    <main className={styles.admin}>
      <header className={styles.hero}>
        <p>Agent Control</p>
        <h1>Edit landing agents from the web.</h1>
        <span>
          Agent Markdown files are saved outside the compiled app and are applied to new agent runs immediately.
        </span>
      </header>
      <AdminAgentEditor initialToken={token} initialAgents={initialAgents} />
    </main>
  );
}
