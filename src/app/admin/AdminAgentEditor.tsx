"use client";

import { useMemo, useState } from "react";
import styles from "./admin.module.css";

type AgentId = EditableAgent["id"];
type StatusFilter = "all" | EditableAgent["status"];

type EditableAgent = {
  id:
    | "editorialSystem"
    | "stitchDesignSystem"
    | "telegramGateway"
    | "slackGateway"
    | "designStyle"
    | "discover"
    | "research"
    | "writer"
    | "designer"
    | "critic"
    | "publisher"
    | "liveMonitor"
    | "liveUpdater";
  label: string;
  role: string;
  filePath: string;
  status: "active" | "role-only" | "system";
  currentDescription: string;
  mdPath: string;
  markdown: string;
};

type PipelineFlow = {
  id: "create" | "live";
  label: string;
  stages: AgentId[];
  availableStages: AgentId[];
};

type ApiState = "idle" | "loading" | "saving" | "error" | "saved";
type AgentGroup = EditableAgent["status"];

const adminApiPath = () => {
  if (typeof window === "undefined") return "/api/admin/agents";
  return window.location.pathname.startsWith("/landings/")
    ? "/landings/api/admin/agents"
    : "/api/admin/agents";
};

const pipelineApiPath = () => {
  if (typeof window === "undefined") return "/api/admin/pipeline";
  return window.location.pathname.startsWith("/landings/")
    ? "/landings/api/admin/pipeline"
    : "/api/admin/pipeline";
};

const statusLabel = (status: EditableAgent["status"]) => {
  if (status === "active") return "Runtime prompt";
  if (status === "system") return "Shared system";
  return "Deterministic role";
};

const statusDescription = (status: EditableAgent["status"]) => {
  if (status === "active") return "Injected into active LLM runs.";
  if (status === "system") return "Base prompt reused across multiple agents.";
  return "Visible here for operator clarity, but executed as code today.";
};

export function AdminAgentEditor({
  initialToken,
  initialAgents,
  initialFlows
}: {
  initialToken: string;
  initialAgents: EditableAgent[];
  initialFlows: PipelineFlow[];
}) {
  const [token, setToken] = useState(initialToken);
  const [agents, setAgents] = useState<EditableAgent[]>(initialAgents);
  const [flows, setFlows] = useState<PipelineFlow[]>(initialFlows);
  const [selectedId, setSelectedId] = useState<AgentId>(initialAgents[0]?.id ?? "writer");
  const [draft, setDraft] = useState(initialAgents[0]?.markdown ?? "");
  const [state, setState] = useState<ApiState>("idle");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const selectedAgent = useMemo(
    () => agents.find(agent => agent.id === selectedId) ?? agents[0],
    [agents, selectedId]
  );

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }),
    [token]
  );

  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return agents.filter(agent => {
      if (statusFilter !== "all" && agent.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        agent.id,
        agent.label,
        agent.role,
        agent.currentDescription,
        agent.filePath,
        agent.mdPath
      ].some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [agents, query, statusFilter]);

  const groupedAgents = useMemo(() => {
    const order: AgentGroup[] = ["active", "system", "role-only"];
    return order.map(group => ({
      group,
      label: statusLabel(group),
      items: filteredAgents.filter(agent => agent.status === group)
    }));
  }, [filteredAgents]);

  const loadAgents = async (preferredAgentId?: AgentId) => {
    setState("loading");
    setMessage("");
    const response = await fetch(adminApiPath(), {
      headers: token ? { "x-admin-token": token } : undefined
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "Could not load agents.");
      return;
    }
    const nextAgents = payload.agents as EditableAgent[];
    const nextSelectedAgent = nextAgents.find(agent => agent.id === preferredAgentId) ?? nextAgents[0];
    setAgents(nextAgents);
    setSelectedId(nextSelectedAgent?.id ?? "writer");
    setDraft(nextSelectedAgent?.markdown ?? "");
    const pipelineResponse = await fetch(pipelineApiPath(), {
      headers: token ? { "x-admin-token": token } : undefined
    });
    const pipelinePayload = await pipelineResponse.json();
    if (pipelineResponse.ok) setFlows(pipelinePayload.flows);
    setState("idle");
  };

  const selectAgent = (agent: EditableAgent) => {
    setSelectedId(agent.id);
    setDraft(agent.markdown);
    setMessage("");
    setState("idle");
  };

  const selectAgentById = (agentId: AgentId) => {
    const agent = agents.find(item => item.id === agentId);
    if (!agent) return;
    selectAgent(agent);
  };

  const save = async () => {
    if (!selectedAgent) return;
    setState("saving");
    setMessage("");
    const response = await fetch(adminApiPath(), {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ agentId: selectedAgent.id, markdown: draft })
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "Could not save agent Markdown.");
      return;
    }
    await loadAgents(selectedAgent.id);
    setDraft(payload.markdown);
    setState("saved");
    setMessage(`${selectedAgent.label} saved. New runs will use this file immediately.`);
  };

  const clear = async () => {
    if (!selectedAgent) return;
    setDraft("");
    setState("saving");
    setMessage("");
    const response = await fetch(adminApiPath(), {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ agentId: selectedAgent.id, markdown: "" })
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "Could not reset agent Markdown.");
      return;
    }
    await loadAgents(selectedAgent.id);
    setDraft(payload.markdown);
    setState("saved");
    setMessage(`${selectedAgent.label} reset to its default Markdown.`);
  };

  const saveFlows = async (nextFlows: PipelineFlow[]) => {
    setFlows(nextFlows);
    setState("saving");
    setMessage("");
    const response = await fetch(pipelineApiPath(), {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        create: nextFlows.find(flow => flow.id === "create")?.stages,
        live: nextFlows.find(flow => flow.id === "live")?.stages
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "Could not save pipeline flow.");
      return;
    }
    setFlows(payload.flows);
    setState("saved");
    setMessage("Pipeline flow saved.");
  };

  const moveStage = (flowId: PipelineFlow["id"], stageId: AgentId, direction: -1 | 1) => {
    const nextFlows = flows.map(flow => {
      if (flow.id !== flowId) return flow;
      const index = flow.stages.indexOf(stageId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= flow.stages.length) return flow;
      const nextStages = [...flow.stages];
      [nextStages[index], nextStages[targetIndex]] = [nextStages[targetIndex], nextStages[index]];
      return { ...flow, stages: nextStages };
    });
    void saveFlows(nextFlows);
  };

  const removeStage = (flowId: PipelineFlow["id"], stageId: AgentId) => {
    const nextFlows = flows.map(flow =>
      flow.id === flowId ? { ...flow, stages: flow.stages.filter(stage => stage !== stageId) } : flow
    );
    void saveFlows(nextFlows);
  };

  const addStage = (flowId: PipelineFlow["id"], stageId: AgentId) => {
    const nextFlows = flows.map(flow =>
      flow.id === flowId && !flow.stages.includes(stageId)
        ? { ...flow, stages: [...flow.stages, stageId] }
        : flow
    );
    void saveFlows(nextFlows);
  };

  const agentLabel = (id: AgentId) => agents.find(agent => agent.id === id)?.label ?? id;
  const draftWordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const draftLineCount = draft ? draft.split("\n").length : 0;
  const unsavedChanges = selectedAgent ? draft !== selectedAgent.markdown : false;
  const activeCount = agents.filter(agent => agent.status === "active").length;
  const systemCount = agents.filter(agent => agent.status === "system").length;
  const roleOnlyCount = agents.filter(agent => agent.status === "role-only").length;
  const totalStages = flows.reduce((sum, flow) => sum + flow.stages.length, 0);
  const selectedFlowUsage = selectedAgent
    ? flows.filter(flow => flow.stages.includes(selectedAgent.id))
    : [];
  const markdownSections = draft
    .split("\n")
    .map((line, index) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      return { level: match[1].length, title: match[2], line: index + 1 };
    })
    .filter((section): section is { level: number; title: string; line: number } => Boolean(section))
    .slice(0, 10);

  return (
    <div className={styles.workspace}>
      <section className={styles.overviewGrid}>
        <article className={styles.overviewCard}>
          <span className={styles.cardEyebrow}>Prompt Surface</span>
          <strong>{agents.length}</strong>
          <p>Editable entries across runtime prompts, shared systems, and deterministic roles.</p>
        </article>
        <article className={styles.overviewCard}>
          <span className={styles.cardEyebrow}>Pipeline Stages</span>
          <strong>{totalStages}</strong>
          <p>Ordered execution slots across create and live update flows.</p>
        </article>
        <article className={styles.overviewCard}>
          <span className={styles.cardEyebrow}>Runtime Agents</span>
          <strong>{activeCount}</strong>
          <p>Prompts appended into live LLM runs and therefore highest-risk to edit casually.</p>
        </article>
        <article className={styles.overviewCard}>
          <span className={styles.cardEyebrow}>Control State</span>
          <strong>{unsavedChanges ? "Draft" : "Synced"}</strong>
          <p>{unsavedChanges ? "The current editor has local changes." : "The selected entry matches disk."}</p>
        </article>
      </section>

      <div className={styles.editor}>
        <aside className={styles.sidebar}>
          <section className={styles.sidebarSection}>
            <div className={styles.sidebarHeader}>
              <div>
                <p>Access</p>
                <h2>Operator controls</h2>
              </div>
              <span className={styles.inlineStatus}>{state === "loading" ? "Loading" : "Ready"}</span>
            </div>

            <label className={styles.tokenField}>
              <span>Admin Token</span>
              <input
                value={token}
                onChange={event => setToken(event.target.value)}
                placeholder="ADMIN_TOKEN"
                type="password"
              />
            </label>

            <div className={styles.sidebarActions}>
              <button className={styles.secondaryButton} onClick={() => void loadAgents(selectedAgent?.id)} type="button">
                Refresh data
              </button>
            </div>
          </section>

          <section className={styles.sidebarSection}>
            <div className={styles.sidebarHeader}>
              <div>
                <p>Directory</p>
                <h2>Agents and prompts</h2>
              </div>
              <span className={styles.inlineStatus}>{filteredAgents.length} shown</span>
            </div>

            <label className={styles.searchField}>
              <span>Search</span>
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search by name, role, or file"
                type="search"
              />
            </label>

            <div className={styles.filterRow} aria-label="Agent filters">
              {(["all", "active", "system", "role-only"] as const).map(filter => (
                <button
                  className={statusFilter === filter ? styles.filterChipActive : styles.filterChip}
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  type="button"
                >
                  {filter === "all" ? "All" : statusLabel(filter)}
                </button>
              ))}
            </div>

            <div className={styles.agentCounts}>
              <span>{activeCount} runtime</span>
              <span>{systemCount} system</span>
              <span>{roleOnlyCount} deterministic</span>
            </div>

            <div className={styles.quickJumpRow}>
              {groupedAgents.map(({ group, label, items }) => (
                <button
                  className={styles.quickJumpButton}
                  key={group}
                  onClick={() => items[0] && selectAgent(items[0])}
                  type="button"
                  disabled={items.length === 0}
                >
                  {label} · {items.length}
                </button>
              ))}
            </div>

            <div className={styles.agentList} role="list">
              {groupedAgents.map(({ group, label, items }) => (
                items.length > 0 ? (
                  <section className={styles.agentGroup} key={group}>
                    <div className={styles.agentGroupHeader}>
                      <span>{label}</span>
                      <small>{items.length}</small>
                    </div>
                    <div className={styles.agentGroupList}>
                      {items.map(agent => {
                        const isActive = agent.id === selectedId;
                        const isDirty = isActive && unsavedChanges;
                        return (
                          <button
                            className={isActive ? styles.activeAgent : styles.agentButton}
                            key={agent.id}
                            onClick={() => selectAgent(agent)}
                            type="button"
                          >
                            <div className={styles.agentButtonTop}>
                              <span>{agent.label}</span>
                              {isDirty ? <i className={styles.unsavedDot} aria-hidden="true" /> : null}
                            </div>
                            <div className={styles.agentMetaRow}>
                              <em>{statusLabel(agent.status)}</em>
                              <small>{agent.id}</small>
                            </div>
                            <small>{agent.role}</small>
                            <small className={styles.agentPath}>{agent.mdPath}</small>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null
              ))}
              {filteredAgents.length === 0 ? (
                <div className={styles.emptyList}>No agents match this filter.</div>
              ) : null}
            </div>
          </section>
        </aside>

        <div className={styles.mainColumn}>
          <section className={styles.operationsStrip}>
            <article className={styles.operationCard}>
              <span className={styles.cardEyebrow}>Create Flow</span>
              <div className={styles.operationStages}>
                {flows.find(flow => flow.id === "create")?.stages.map(stage => (
                  <button className={styles.operationStage} key={`ops-create-${stage}`} onClick={() => selectAgentById(stage)} type="button">
                    {agentLabel(stage)}
                  </button>
                ))}
              </div>
            </article>
            <article className={styles.operationCard}>
              <span className={styles.cardEyebrow}>Live Flow</span>
              <div className={styles.operationStages}>
                {flows.find(flow => flow.id === "live")?.stages.map(stage => (
                  <button className={styles.operationStage} key={`ops-live-${stage}`} onClick={() => selectAgentById(stage)} type="button">
                    {agentLabel(stage)}
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section className={styles.pipelineSection}>
            <div className={styles.sectionHeading}>
              <div>
                <p>Execution Order</p>
                <h2>Pipeline flows</h2>
                <span>Adjust stage order without leaving the editor. Validation still runs server-side.</span>
              </div>
            </div>
            <div className={styles.flowGrid}>
              {flows.map(flow => {
                const inactive = flow.availableStages.filter(stage => !flow.stages.includes(stage));
                return (
                  <article className={styles.flowCard} key={flow.id}>
                    <div className={styles.flowCardHeader}>
                      <div>
                        <strong>{flow.label}</strong>
                        <p>{flow.stages.length} active stages</p>
                      </div>
                    </div>
                    <div className={styles.flowStages}>
                      {flow.stages.map((stage, index) => (
                        <div className={styles.flowStage} key={`${flow.id}-${stage}`}>
                          <div className={styles.flowStageMeta}>
                            <span className={styles.flowStageIndex}>{index + 1}</span>
                            <button className={styles.stageName} onClick={() => selectAgentById(stage)} type="button">
                              {agentLabel(stage)}
                            </button>
                          </div>
                          <div className={styles.flowActions}>
                            <button onClick={() => moveStage(flow.id, stage, -1)} type="button" disabled={index === 0}>
                              Up
                            </button>
                            <button
                              onClick={() => moveStage(flow.id, stage, 1)}
                              type="button"
                              disabled={index === flow.stages.length - 1}
                            >
                              Down
                            </button>
                            <button onClick={() => removeStage(flow.id, stage)} type="button">
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {inactive.length > 0 ? (
                      <div className={styles.flowAddSection}>
                        <span className={styles.blockLabel}>Available stages</span>
                        <div className={styles.flowAddList}>
                          {inactive.map(stage => (
                            <button
                              className={styles.addStageButton}
                              key={`${flow.id}-add-${stage}`}
                              onClick={() => addStage(flow.id, stage)}
                              type="button"
                            >
                              Add {agentLabel(stage)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className={styles.panel}>
            {selectedAgent ? (
              <>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitleGroup}>
                    <p>{selectedAgent.id}</p>
                    <div className={styles.titleRow}>
                      <h2>{selectedAgent.label}</h2>
                      {unsavedChanges ? <span className={styles.draftBadge}>Unsaved changes</span> : null}
                    </div>
                    <span>{selectedAgent.role}</span>
                    <small className={styles.pathText}>{selectedAgent.mdPath}</small>
                  </div>

                  <div className={styles.panelHeaderMeta}>
                    <strong className={selectedAgent.status === "active" ? styles.activeBadge : styles.roleBadge}>
                      {statusLabel(selectedAgent.status)}
                    </strong>
                    <p>{statusDescription(selectedAgent.status)}</p>
                    <div className={styles.actions}>
                      <button className={styles.secondaryButton} onClick={clear} type="button" disabled={state === "saving"}>
                        Reset
                      </button>
                      <button
                        className={styles.primaryButton}
                        onClick={save}
                        type="button"
                        disabled={state === "saving" || !unsavedChanges}
                      >
                        {state === "saving" ? "Saving" : "Save changes"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.infoGrid}>
                  <article className={styles.descriptionBlock}>
                    <span>Agent summary</span>
                    <p>{selectedAgent.currentDescription}</p>
                  </article>
                  <article className={styles.metaCard}>
                    <span>Prompt file</span>
                    <p>{selectedAgent.filePath}</p>
                  </article>
                  <article className={styles.metaCard}>
                    <span>Draft metrics</span>
                    <p>{draftWordCount} words</p>
                    <p>{draftLineCount} lines</p>
                  </article>
                  <article className={styles.metaCard}>
                    <span>Flow usage</span>
                    {selectedFlowUsage.length > 0 ? (
                      selectedFlowUsage.map(flow => <p key={`usage-${flow.id}`}>{flow.label}</p>)
                    ) : (
                      <p>Not used in current flow config</p>
                    )}
                  </article>
                </div>

                <div className={styles.editorCard}>
                  <div className={styles.editorCardHeader}>
                    <div>
                      <span className={styles.blockLabel}>Markdown editor</span>
                      <p>
                        Edit the operational instructions directly. Save writes to disk and affects future runs immediately.
                      </p>
                    </div>
                    {markdownSections.length > 0 ? (
                      <div className={styles.editorOutline}>
                        <span className={styles.blockLabel}>Outline</span>
                        <div className={styles.outlineList}>
                          {markdownSections.map(section => (
                            <span className={styles.outlineItem} data-level={section.level} key={`${section.line}-${section.title}`}>
                              L{section.line} · {section.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <textarea
                    className={styles.textarea}
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder={
                      selectedAgent.status === "active"
                        ? `Edit the Markdown instructions for ${selectedAgent.label}. These are injected into new LLM runs.`
                        : selectedAgent.status === "system"
                          ? `Edit the shared ${selectedAgent.label}. This is the true base prompt injected into multiple agents.`
                          : `Edit the Markdown instructions for ${selectedAgent.label}. This role is visible here, but current execution is deterministic code rather than an LLM prompt.`
                    }
                    spellCheck={false}
                  />
                </div>

                <div className={styles.statusBar} data-state={state}>
                  <div>
                    <span className={styles.blockLabel}>System message</span>
                    <p>
                      {message || (selectedAgent.status === "active"
                        ? "This Markdown is appended to the selected active agent at runtime."
                        : selectedAgent.status === "system"
                          ? "This shared system prompt is reused across multiple agents."
                          : "This Markdown is editable for operational clarity, but the role currently executes as deterministic code.")}
                    </p>
                  </div>
                  <div className={styles.statusMeta}>
                    <span>{state === "saved" ? "Saved" : state === "saving" ? "Saving" : state === "error" ? "Error" : "Idle"}</span>
                    <span>{unsavedChanges ? "Draft diverges from disk" : "Draft matches disk"}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.empty}>
                <h2>No agents loaded</h2>
                <p>Enter the admin token and refresh data to load the editable agent list.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
