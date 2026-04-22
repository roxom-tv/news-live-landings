export type LandingStatus = "drafting" | "critic_review" | "live" | "paused" | "blocked" | "cancelled" | "failed";

export type Materiality = "NO_MATERIAL_CHANGE" | "MINOR" | "IMPORTANT" | "CRITICAL" | "BLOCKER";

export type AgentName =
  | "telegramGateway"
  | "discover"
  | "research"
  | "writer"
  | "designer"
  | "critic"
  | "publisher"
  | "liveMonitor"
  | "liveUpdater";

export type Source = {
  title: string;
  outlet: string;
  url: string;
  publishedAt?: string;
  credibility: "tier1" | "tier2" | "unknown";
};

export type SourceBoundFact = {
  claim: string;
  sourceUrl: string;
};

export type ImageCandidate = {
  url: string;
  title: string;
  credit: string;
  alt: string;
  sourceUrl: string;
  relevance?: "direct" | "contextual" | "fallback";
  relevanceReason?: string;
};

export type VisualAsset = {
  type: "image" | "chart" | "map" | "svg";
  title: string;
  url?: string;
  credit: string;
  alt: string;
  relevance?: "direct" | "contextual" | "fallback";
  relevanceReason?: string;
};

export type StorySection = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  visualHint: "image" | "chart" | "map" | "quote" | "data" | "svg";
  sourceUrls: string[];
};

export type LandingDesignSpec = {
  source: "stitch";
  styleName: string;
  layout:
    | "visual-cover"
    | "person-profile"
    | "event-brief"
    | "timeline"
    | "data-dashboard"
    | "market-brief"
    | "competition-brief"
    | "election-brief";
  mood: string;
  palette: {
    background: string;
    text: string;
    accent: string;
    muted: string;
  };
  heroTreatment: string;
  motion: string;
  notes: string[];
};

export type LandingContent = {
  slug: string;
  topic: string;
  headline: string;
  subheadline: string;
  summary: string;
  status: LandingStatus;
  lastUpdatedUtc: string;
  sources: Source[];
  visuals: VisualAsset[];
  sections: StorySection[];
  quotes: Array<{
    quote: string;
    attribution: string;
    sourceUrl: string;
  }>;
  dataPoints: Array<{
    label: string;
    value: string;
    context: string;
    sourceUrl: string;
  }>;
  designSpec?: LandingDesignSpec;
  updateHistory: Array<{
    timestampUtc: string;
    materiality: Materiality;
    summary: string;
    sourceUrls: string[];
  }>;
};

export type LandingRecord = {
  id: number;
  slug: string;
  topic: string;
  status: LandingStatus;
  finalUrl: string;
  content: LandingContent;
  createdAt: string;
  updatedAt: string;
  lastCycleAt?: string;
};

export type CriticResult = {
  approved: boolean;
  severity: "approved" | "changes_requested" | "blocked";
  issues: string[];
  summary: string;
};

export type LiveMonitorResult = {
  materiality: Materiality;
  summary: string;
  delta: string;
  sourceUrls: string[];
};
