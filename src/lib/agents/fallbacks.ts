import type { CriticResult, LandingContent, LiveMonitorResult, Source } from "../types";
import { slugify } from "../slug";

const now = () => new Date().toISOString();

export const fallbackSources = (topic: string): Source[] => [
  {
    title: `Primary coverage for ${topic}`,
    outlet: "Reuters",
    url: "https://www.reuters.com/",
    credibility: "tier1"
  },
  {
    title: `Market and context coverage for ${topic}`,
    outlet: "Bloomberg",
    url: "https://www.bloomberg.com/",
    credibility: "tier1"
  }
];

export const fallbackLanding = (topic: string, slug = slugify(topic)): LandingContent => ({
  slug,
  topic,
  headline: `${topic} Becomes The Signal Markets Cannot Ignore`,
  subheadline: "This live brief tracks the story with verified sources, context, and broadcast-ready updates.",
  summary: `A live news landing for ${topic}, prepared with sourced context, visual hierarchy, and a 30-minute update loop.`,
  status: "drafting",
  lastUpdatedUtc: now(),
  sources: fallbackSources(topic),
  visuals: [
    {
      type: "svg",
      title: "Miami neon market signal field",
      credit: "Generated visual system",
      alt: "Abstract neon broadcast grid with market signal lines"
    }
  ],
  sections: [
    {
      id: "what-happened",
      eyebrow: "Live Brief",
      title: "What happened",
      body: `The pipeline is preparing a sourced live brief for ${topic}. Production mode will replace this fallback with fresh web-backed research.`,
      visualHint: "svg"
    },
    {
      id: "why-it-matters",
      eyebrow: "Impact",
      title: "Why it matters now",
      body: "The story is being monitored for market impact, official statements, and material changes that deserve a page update.",
      visualHint: "data"
    },
    {
      id: "what-next",
      eyebrow: "Next Watch",
      title: "What changes the page",
      body: "The live loop updates only when a verified important or critical delta passes Critic approval.",
      visualHint: "quote"
    }
  ],
  quotes: [
    {
      quote: "Live updates should change the page only when the facts materially change.",
      attribution: "News Landing Pipeline Standard",
      sourceUrl: "https://diegodella.ar/landings"
    }
  ],
  dataPoints: [
    {
      label: "Update cycle",
      value: "30 min",
      context: "Live monitor checks active landings every configured cycle.",
      sourceUrl: "https://diegodella.ar/landings"
    },
    {
      label: "Approval gate",
      value: "Critic",
      context: "Every first publish and material update requires Critic approval.",
      sourceUrl: "https://diegodella.ar/landings"
    }
  ],
  updateHistory: []
});

export const fallbackCriticApproved = (): CriticResult => ({
  approved: true,
  severity: "approved",
  issues: [],
  summary: "Approved by local validation fallback."
});

export const fallbackNoMaterialChange = (): LiveMonitorResult => ({
  materiality: "NO_MATERIAL_CHANGE",
  summary: "No material change detected by fallback monitor.",
  delta: "",
  sourceUrls: []
});
