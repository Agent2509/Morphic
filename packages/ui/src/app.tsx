import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { AgentController, type PermissionRequest } from "@morphic/core";
import { getTheme, buildBanner, type ThemeName } from "./theme.js";
import { Status } from "./components/Status.js";
import { Stream, type LogEntry } from "./components/Stream.js";
import { Input } from "./components/Input.js";
import { PermissionPrompt } from "./components/Permission.js";

import type { HardwareProfile, SmartRouter } from "@morphic/calibration";
import type { ModelProvider } from "@morphic/providers";
import type {
  AgentRole,
  PipelineCoordinator,
  PipelineStageStatus,
} from "@morphic/agents";
import { AgentPipeline } from "./components/AgentPipeline.js";

export interface MorphicAppProps {
  controller: AgentController;
  coordinator?: PipelineCoordinator;
  providerName: string;
  modelName: string;
  themeName?: ThemeName;
  tier?: string;
  router?: SmartRouter;
  profile?: HardwareProfile;
  initialPrompt?: string;
  onUndo?: () => Promise<{ success: boolean; message: string }>;
  onExit?: () => void;
  providerResolver?: (id: string) => ModelProvider | undefined;
}

interface PendingPermission {
  request: PermissionRequest;
  resolve: (allowed: boolean) => void;
}

export const MorphicApp: React.FC<MorphicAppProps> = ({
  controller,
  coordinator,
  providerName: initialProviderName,
  modelName: initialModelName,
  themeName,
  tier,
  router,
  profile,
  initialPrompt,
  onUndo,
  onExit,
  providerResolver,
}) => {
  const activeTheme = getTheme(themeName);
  const banner = buildBanner(activeTheme);
  const [providerName, setProviderName] = useState(initialProviderName);
  const [modelName, setModelName] = useState(initialModelName);
  const [inputValue, setInputValue] = useState("");
  const [status, setStatus] = useState("Idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentStream, setCurrentStream] = useState("");
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const pendingRef = useRef<PendingPermission | null>(null);
  const mountedRef = useRef(true);

  // Pipeline state
  const [activeRole, setActiveRole] = useState<AgentRole | null>(null);
  const [activeRoles, setActiveRoles] = useState<AgentRole[]>([
    "planner",
    "researcher",
    "coder",
    "reviewer",
    "tester",
  ]);
  const [pipelineStatuses, setPipelineStatuses] = useState<
    Record<AgentRole, PipelineStageStatus>
  >({
    planner: "pending",
    researcher: "pending",
    coder: "pending",
    reviewer: "pending",
    tester: "pending",
  });
  const [retryCount, setRetryCount] = useState(0);

  const isRunningRef = useRef(false);
  const { exit } = useApp();

  // Ctrl+C triggers the cleanup path instead of an abrupt exit.
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (onExit) onExit();
      else exit();
    }
  });

  // Hook permission handler
  useEffect(() => {
    mountedRef.current = true;
    const permissions = controller.getPermissions();
    permissions.setPromptHandler((req) => {
      return new Promise<boolean>((resolve) => {
        const pending = { request: req, resolve };
        pendingRef.current = pending;
        setPendingPermission(pending);
      });
    });
    return () => {
      mountedRef.current = false;
      permissions.clearPromptHandler();
      // Never leave the controller awaiting a decision that can no longer come.
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    };
  }, [controller]);

  // Handle permission decision
  const handlePermissionDecision = (decision: "allow" | "deny" | "always") => {
    if (!pendingPermission) return;
    const { request, resolve } = pendingPermission;

    if (decision === "always") {
      controller.getPermissions().alwaysAllow(request.tool.name);
      resolve(true);
    } else if (decision === "allow") {
      resolve(true);
    } else {
      resolve(false);
    }

    pendingRef.current = null;
    setPendingPermission(null);
  };

  const executePrompt = async (promptText: string) => {
    if (!promptText.trim() || isRunningRef.current) return;
    isRunningRef.current = true;

    setLogs((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        type: "user",
        content: promptText,
      },
    ]);

    setInputValue("");
    setCurrentStream("");

    if (promptText.trim() === "/undo") {
      try {
        if (onUndo) {
          setStatus("Undoing...");
          const res = await onUndo();
          setStatus("Idle");
          setLogs((prev) => [
            ...prev,
            {
              id: `undo_${Date.now()}`,
              type: res.success ? "assistant" : "error",
              content: res.message,
            },
          ]);
        } else {
          setLogs((prev) => [
            ...prev,
            {
              id: `undo_${Date.now()}`,
              type: "error",
              content: "Undo not configured or no snapshot available.",
            },
          ]);
        }
      } catch (err: any) {
        setLogs((prev) => [
          ...prev,
          {
            id: `undo_err_${Date.now()}`,
            type: "error",
            content: `Undo failed: ${err?.message || String(err)}`,
          },
        ]);
      } finally {
        setStatus("Idle");
        isRunningRef.current = false;
      }
      return;
    }

    try {
      if (router && profile) {
        const decision = await router.decideRoute(promptText, profile);
        setModelName(decision.model);
        controller.setModel(decision.model);
        coordinator?.setModel(decision.model);

        // Switch providers when the router picks cloud/local.
        if (providerResolver) {
          const resolved = providerResolver(decision.providerId);
          if (resolved) {
            controller.setProvider(resolved);
            coordinator?.setProvider(resolved);
            setProviderName(resolved.name);
          }
        }

        setLogs((prev) => [
          ...prev,
          {
            id: `route_${Date.now()}`,
            type: "tool_call",
            toolName: "smart_router",
            content: `${decision.route.toUpperCase()} -> ${decision.providerId}:${decision.model} [Complexity ${decision.complexity}/10: ${decision.reason}]`,
          },
        ]);
      }

      let finalResult = "";

      if (coordinator) {
        const complexity = router ? router.classifyComplexity(promptText) : 5;
        const roles = coordinator.selectPipelineRoles(complexity);
        setActiveRoles(roles);
        setRetryCount(0);

        const initialStatuses: Record<AgentRole, PipelineStageStatus> = {
          planner: roles.includes("planner") ? "pending" : "skipped",
          researcher: roles.includes("researcher") ? "pending" : "skipped",
          coder: roles.includes("coder") ? "pending" : "skipped",
          reviewer: roles.includes("reviewer") ? "pending" : "skipped",
          tester: roles.includes("tester") ? "pending" : "skipped",
        };
        setPipelineStatuses(initialStatuses);

        const outcome = await coordinator.run(promptText, complexity, {
          onStatusChange: (newStatus) => setStatus(newStatus),
          onAgentStart: (role) => {
            setActiveRole(role);
            setPipelineStatuses((prev) => ({ ...prev, [role]: "running" }));
            setLogs((prev) => [
              ...prev,
              {
                id: `agent_${role}_${Date.now()}`,
                type: "tool_call",
                toolName: `tribe_${role}`,
                content: `Agent ${role.toUpperCase()} active`,
              },
            ]);
          },
          onAgentFinish: (role, handoff) => {
            setPipelineStatuses((prev) => ({ ...prev, [role]: "completed" }));
          },
          onRetry: (role, reason, count) => {
            setRetryCount(count);
            setPipelineStatuses((prev) => ({ ...prev, [role]: "pending" }));
            setLogs((prev) => [
              ...prev,
              {
                id: `retry_${Date.now()}`,
                type: "tool_call",
                toolName: "tribe_retry",
                content: `Retry #${count} triggered by ${role}: ${reason}`,
              },
            ]);
          },
          onToken: (token) => {
            setCurrentStream((prev) => prev + token);
          },
        });
        finalResult = outcome.summary;
        if (!outcome.success) {
          setLogs((prev) => [
            ...prev,
            {
              id: `pipeline_fail_${Date.now()}`,
              type: "error",
              content: `Pipeline failed at '${outcome.failedRole ?? "unknown"}'.`,
            },
          ]);
        }
        setActiveRole(null);
      } else {
        finalResult = await controller.run(promptText, {
          onStatusChange: (newStatus) => setStatus(newStatus),
          onToken: (token) => {
            setCurrentStream((prev) => prev + token);
          },
          onToolStart: (id, name, args) => {
            setLogs((prev) => [
              ...prev,
              {
                id,
                type: "tool_call",
                toolName: name,
                content: JSON.stringify(args),
              },
            ]);
          },
          onToolFinish: (id, name, res) => {
            setLogs((prev) => [
              ...prev,
              {
                id: `${id}_res`,
                type: "tool_result",
                toolName: name,
                content: res.success ? res.output : res.error || "Failed",
                success: res.success,
              },
            ]);
          },
        });
      }

      setLogs((prev) => [
        ...prev,
        {
          id: `asst_${Date.now()}`,
          type: "assistant",
          content: finalResult,
        },
      ]);
      setCurrentStream("");
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          type: "error",
          content: err.message || String(err),
        },
      ]);
    } finally {
      setStatus("Idle");
      isRunningRef.current = false;
    }
  };

  // Run initial prompt if passed (via ref so we don't capture a stale closure)
  const executePromptRef = useRef(executePrompt);
  executePromptRef.current = executePrompt;
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      executePromptRef.current(initialPrompt.trim());
    }
  }, [initialPrompt]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>{banner}</Text>

      <Status
        status={status}
        provider={providerName}
        model={modelName}
        tier={tier}
        permissionLevel={controller.getPermissions().getLevel()}
      />

      {coordinator && (
        <AgentPipeline
          activeRole={activeRole}
          activeRoles={activeRoles}
          statuses={pipelineStatuses}
          retryCount={retryCount}
        />
      )}

      <Stream logs={logs} currentStream={currentStream} />

      {pendingPermission ? (
        <PermissionPrompt
          toolName={pendingPermission.request.tool.name}
          category={pendingPermission.request.tool.category}
          args={pendingPermission.request.args}
          reason={pendingPermission.request.reason}
          onDecision={handlePermissionDecision}
        />
      ) : (
        <Input
          value={inputValue}
          onChange={setInputValue}
          onSubmit={executePrompt}
          disabled={status !== "Idle"}
        />
      )}
    </Box>
  );
};
