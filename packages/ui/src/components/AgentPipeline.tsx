import React from "react";
import { Box, Text } from "ink";
import type { AgentRole, PipelineStageStatus } from "@morphic/agents";

export interface AgentPipelineProps {
  activeRole: AgentRole | null;
  activeRoles: AgentRole[];
  statuses: Record<AgentRole, PipelineStageStatus>;
  retryCount: number;
}

const ROLE_ICONS: Record<AgentRole, string> = {
  planner: "🗺️",
  researcher: "🔍",
  coder: "💻",
  reviewer: "🔎",
  tester: "🧪",
};

const ALL_ROLES: AgentRole[] = ["planner", "researcher", "coder", "reviewer", "tester"];

export const AgentPipeline: React.FC<AgentPipelineProps> = ({
  activeRole,
  activeRoles,
  statuses,
  retryCount,
}) => {
  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor={activeRole ? "cyan" : "gray"}
      paddingX={1}
      marginY={1}
      alignItems="center"
    >
      <Text color="cyan" bold>
        Tribe:{" "}
      </Text>

      {ALL_ROLES.map((role, idx) => {
        const isIncluded = activeRoles.includes(role);
        const isActive = activeRole === role;
        const status = statuses[role];

        let label = `${ROLE_ICONS[role]} ${role}`;
        let color: string = "gray";

        if (!isIncluded) {
          color = "gray";
          label = `${ROLE_ICONS[role]} (skip)`;
        } else if (isActive) {
          color = "cyan";
          label = `▶ ${ROLE_ICONS[role]} ${role}`;
        } else if (status === "completed") {
          color = "green";
          label = `✔ ${ROLE_ICONS[role]} ${role}`;
        } else if (status === "failed") {
          color = "red";
          label = `✖ ${ROLE_ICONS[role]} ${role}`;
        }

        return (
          <Box key={role} flexDirection="row" alignItems="center">
            <Text color={color as any} bold={isActive}>
              {label}
            </Text>
            {idx < ALL_ROLES.length - 1 && (
              <Text color="gray"> ➔ </Text>
            )}
          </Box>
        );
      })}

      {retryCount > 0 && (
        <Box marginLeft={1}>
          <Text color="yellow" bold>
            [Retries: {retryCount}]
          </Text>
        </Box>
      )}
    </Box>
  );
};
