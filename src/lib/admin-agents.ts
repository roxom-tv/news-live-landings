import { mkdir, readFile, writeFile } from "node:fs/promises";
import { env } from "./config";
import type { AgentName } from "./types";

export type EditableAgentId = AgentName;

export type EditableAgent = {
  id: EditableAgentId;
  label: string;
  role: string;
  filePath: string;
  status: "active" | "role-only";
  currentDescription: string;
  override: string;
};

const agentDefinitions: Array<Omit<EditableAgent, "override">> = [
  {
    id: "telegramGateway",
    label: "Telegram Gateway",
    role: "Remote control, command parsing, status replies, and operational alerts.",
    filePath: "src/lib/telegram.ts",
    status: "role-only",
    currentDescription:
      "Receives Telegram commands, verifies allowed chats, starts discovered or requested landings, reports stage progress, sends final URLs, lists live landings, and can trigger live update cycles. This role does not currently call an LLM directly."
  },
  {
    id: "discover",
    label: "Discover Agent",
    role: "Finds the best timely, source-rich topic when Diego asks the system to choose.",
    filePath: "src/lib/agents/discover.ts",
    status: "active",
    currentDescription:
      "Uses current web search to select one timely landing topic with a meaningful new development from the last 8 hours. It prefers credible source coverage, urgency, strong visual potential, named actors, measurable deltas, and landing suitability. Returns 3-5 scored candidates with freshness evidence plus the selected topic and rationale."
  },
  {
    id: "research",
    label: "Research Agent",
    role: "Finds current sources, source-bound facts, images, quotes, and data before writing.",
    filePath: "src/lib/agents/research.ts",
    status: "active",
    currentDescription:
      "Builds the factual source package for a requested topic, preserving the freshest current angle and last-8-hours developments when available. It gathers credible current sources, source-bound facts, image candidates, quotes, and data points that downstream writing and design agents must stay faithful to."
  },
  {
    id: "writer",
    label: "Writer Agent",
    role: "Creates headline, summary, sections, quotes, and data points from the research package.",
    filePath: "src/lib/agents/writer.ts",
    status: "active",
    currentDescription:
      "Turns the research package into a structured editorial brief: headline, subheadline, summary, sections, quotes, data points, update history, and source usage. It owns first-pass top-line clarity: what changed now, why it matters, who is involved, current status, evidence, reactions, uncertainty, and next steps."
  },
  {
    id: "designer",
    label: "Designer Agent",
    role: "Chooses layout, visual hierarchy, design spec, visuals, and final LandingContent structure.",
    filePath: "src/lib/agents/designer.ts",
    status: "active",
    currentDescription:
      "Converts the written brief and research package into final LandingContent. It owns layout choice, first-viewport clarity, visual hierarchy, hero treatment, visual relevance, section composition, source footer structure, and design spec. It also performs critic-requested repair revisions and should produce near-publishable output before Critic sees it."
  },
  {
    id: "critic",
    label: "Critic Agent",
    role: "Reviews safety, sourcing, section quality, visual relevance, and publication readiness.",
    filePath: "src/lib/agents/critic.ts",
    status: "active",
    currentDescription:
      "Reviews the generated landing before publication as a red team. It checks source support, factual caution, unsafe claims, freshness, first-viewport clarity, section quality, visual relevance, and publication readiness. Its issues must be understandable and directly repairable."
  },
  {
    id: "publisher",
    label: "Publisher",
    role: "Persists approved content and exposes the final public URL.",
    filePath: "src/lib/pipeline.ts",
    status: "role-only",
    currentDescription:
      "Saves approved landing content, marks the landing live, keeps blocked or failed pages unpublished, and exposes the final URL through the landings route. This role is deterministic pipeline code and does not currently call an LLM directly."
  },
  {
    id: "liveMonitor",
    label: "Live Monitor",
    role: "Checks live pages for material verified changes on later cycles.",
    filePath: "src/lib/agents/live.ts",
    status: "active",
    currentDescription:
      "Uses current web search to monitor an already-live landing for net-new verified updates, especially since lastUpdatedUtc and inside the last 8 hours. It classifies materiality as no change, minor, important, critical, or blocker, and returns a sourced delta summary."
  },
  {
    id: "liveUpdater",
    label: "Live Updater",
    role: "Applies verified live deltas while preserving editorial and visual quality.",
    filePath: "src/lib/agents/live.ts",
    status: "active",
    currentDescription:
      "Applies an important or critical monitor delta to the full LandingContent JSON. It integrates the fresh update into the narrative and first viewport while preserving structure, source credits, article depth, relevant visuals, and the complete source list before Critic reviews the update."
  }
];

const storeDirectory = () => process.env.AGENT_OVERRIDES_DIR ?? (env.pipelineEnv === "prod" ? "/data" : "/tmp");
const storePath = () => `${storeDirectory().replace(/\/$/, "")}/admin-agent-overrides.json`;

const readOverrides = async (): Promise<Partial<Record<EditableAgentId, string>>> => {
  try {
    return JSON.parse(await readFile(storePath(), "utf8")) as Partial<Record<EditableAgentId, string>>;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
};

export const listEditableAgents = async (): Promise<EditableAgent[]> => {
  const overrides = await readOverrides();
  return agentDefinitions.map(agent => ({
    ...agent,
    override: overrides[agent.id] ?? ""
  }));
};

export const getAgentOverride = async (agentId: EditableAgentId) => {
  const overrides = await readOverrides();
  const override = overrides[agentId]?.trim();
  if (!override) return "";
  return `\n\nAdmin override for ${agentId} agent:\n${override}\n`;
};

export const saveAgentOverride = async (agentId: EditableAgentId, override: string) => {
  if (!agentDefinitions.some(agent => agent.id === agentId)) {
    throw new Error(`Unknown editable agent: ${agentId}`);
  }
  const cleaned = override.trim();
  const overrides = await readOverrides();
  if (cleaned) {
    overrides[agentId] = cleaned;
  } else {
    delete overrides[agentId];
  }
  await mkdir(storeDirectory(), { recursive: true });
  await writeFile(storePath(), `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
  return cleaned;
};

export const isEditableAgentId = (value: unknown): value is EditableAgentId =>
  typeof value === "string" && agentDefinitions.some(agent => agent.id === value);
