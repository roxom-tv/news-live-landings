"use client";

import { useMemo, useState } from "react";
import styles from "./admin.module.css";

type AgentId = EditableAgent["id"];

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

  const selectedAgent = useMemo(
    () => agents.find(agent => agent.id === selectedId) ?? agents[0],
    [agents, selectedId]
  );

  const authHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    ...(token ? { "x-admin-token": token } : {})
  }), [token]);

  const loadAgents = async (preferredAgentId?: AgentId) => {
    setState("loading");
    setMessage("");
    const response = await fetch(adminApiPath(), { headers: token ? { "x-admin-token": token } : undefined });
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
    const pipelineResponse = await fetch(pipelineApiPath(), { headers: token ? { "x-admin-token": token } : undefined });
    const pipelinePayload = await pipelineResponse.json();
    if (pipelineResponse.ok) setFlows(pipelinePayload.flows);
    setState("idle");
  };

  const updateToken = (value: string) => {
    setToken(value);
  };

  const selectAgent = (agent: EditableAgent) => {
    setSelectedId(agent.id);
    setDraft(agent.markdown);
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
    setMessage(`${selectedAgent.label} Markdown saved. New runs will use this file.`);
  };

  const clear = async () => {
    setDraft("");
    if (!selectedAgent) return;
    setState("saving");
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
    setMessage(`${selectedAgent.label} Markdown reset to default.`);
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
    const nextFlows = flows.map(flow => (
      flow.id === flowId ? { ...flow, stages: flow.stages.filter(stage => stage !== stageId) } : flow
    ));
    void saveFlows(nextFlows);
  };

  const addStage = (flowId: PipelineFlow["id"], stageId: AgentId) => {
    const nextFlows = flows.map(flow => (
      flow.id === flowId && !flow.stages.includes(stageId)
        ? { ...flow, stages: [...flow.stages, stageId] }
        : flow
    ));
    void saveFlows(nextFlows);
  };

  const agentLabel = (id: AgentId) => agents.find(agent => agent.id === id)?.label ?? id;
  const statusLabel = (status: EditableAgent["status"]) => {
    if (status === "active") return "Active prompt";
    if (status === "system") return "System prompt";
    return "Role only";
  };

  return (
    <div className={styles.editor}>
      <aside className={styles.sidebar}>
        <label className={styles.tokenField}>
          <span>Admin Token</span>
          <input
            value={token}
            onChange={event => updateToken(event.target.value)}
            placeholder="ADMIN_TOKEN"
            type="password"
          />
        </label>
        <button className={styles.secondaryButton} onClick={() => void loadAgents()} type="button">
          Load Agents
        </button>
        <div className={styles.agentList} role="list">
          {agents.map(agent => (
            <button
              className={agent.id === selectedId ? styles.activeAgent : styles.agentButton}
              key={agent.id}
              onClick={() => selectAgent(agent)}
              type="button"
            >
              <span>{agent.label}</span>
              <em>{statusLabel(agent.status)}</em>
              <small>{agent.mdPath}</small>
            </button>
          ))}
        </div>
        <div className={styles.pipelineBlock}>
          <span className={styles.blockLabel}>Pipeline Flows</span>
          {flows.map(flow => {
            const inactive = flow.availableStages.filter(stage => !flow.stages.includes(stage));
            return (
              <div className={styles.flowCard} key={flow.id}>
                <strong>{flow.label}</strong>
                <div className={styles.flowStages}>
                  {flow.stages.map((stage, index) => (
                    <div className={styles.flowStage} key={`${flow.id}-${stage}`}>
                      <button className={styles.stageName} onClick={() => selectAgentById(stage)} type="button">
                        {agentLabel(stage)}
                      </button>
                      <div className={styles.flowActions}>
                        <button onClick={() => moveStage(flow.id, stage, -1)} type="button" disabled={index === 0}>Up</button>
                        <button onClick={() => moveStage(flow.id, stage, 1)} type="button" disabled={index === flow.stages.length - 1}>Down</button>
                        <button onClick={() => removeStage(flow.id, stage)} type="button">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                {inactive.length > 0 && (
                  <div className={styles.flowAddList}>
                    {inactive.map(stage => (
                      <button className={styles.addStageButton} key={`${flow.id}-add-${stage}`} onClick={() => addStage(flow.id, stage)} type="button">
                        Add {agentLabel(stage)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <section className={styles.panel}>
        {selectedAgent ? (
          <>
            <div className={styles.panelHeader}>
              <div>
                <p>{selectedAgent.id}</p>
                <h2>{selectedAgent.label}</h2>
                <span>{selectedAgent.role}</span>
                <small className={styles.pathText}>{selectedAgent.mdPath}</small>
              </div>
              <strong className={selectedAgent.status === "active" ? styles.activeBadge : styles.roleBadge}>
                {selectedAgent.status === "active" ? "Runtime prompt" : selectedAgent.status === "system" ? "Shared system" : "Pipeline role"}
              </strong>
              <div className={styles.actions}>
                <button className={styles.secondaryButton} onClick={clear} type="button" disabled={state === "saving"}>
                  Reset
                </button>
                <button className={styles.primaryButton} onClick={save} type="button" disabled={state === "saving"}>
                  {state === "saving" ? "Saving" : "Save"}
                </button>
              </div>
            </div>
            <div className={styles.descriptionBlock}>
              <div>
                <span>Agent Summary</span>
                <p>{selectedAgent.currentDescription}</p>
              </div>
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
            <div className={styles.status} data-state={state}>
              {message || (selectedAgent.status === "active"
                ? "This Markdown is loaded from disk and appended to the selected active agent at runtime."
                : selectedAgent.status === "system"
                  ? "This shared system prompt is loaded from disk and used as the real base prompt for multiple agents."
                : "This Markdown is loaded from disk for visibility and editing. The role currently runs as deterministic code.")}
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <h2>No agents loaded</h2>
            <p>Enter the admin token and load the editable agent list.</p>
          </div>
        )}
      </section>
    </div>
  );
}
