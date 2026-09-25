import React from "react";
import { Box, Text } from "ink";
import chalk from "chalk";

export interface StatusProps {
  status: string;
  provider: string;
  model: string;
  permissionLevel: number;
  tier?: string;
  gitBranch?: string;
  cwd?: string;
}

export const Status: React.FC<StatusProps> = ({
  status,
  provider,
  model,
  permissionLevel,
  tier,
  gitBranch,
  cwd,
}) => {
  const permBadge = `L${permissionLevel}`;
  const permColor =
    permissionLevel === 1
      ? chalk.red(permBadge)
      : permissionLevel === 2
      ? chalk.yellow(permBadge)
      : permissionLevel === 3
      ? chalk.blue(permBadge)
      : chalk.green(permBadge);

  const folderName = cwd ? cwd.split("/").filter(Boolean).pop() || "project" : undefined;
  const isIdle = status === "Idle";

  return (
    <Box
      flexDirection="column"
      marginTop={1}
    >
      <Box
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        justifyContent="space-between"
      >
        <Box>
          {gitBranch && (
            <>
              <Text color="magenta">🌿 {gitBranch}</Text>
              <Text color="gray"> │ </Text>
            </>
          )}
          {folderName && (
            <>
              <Text color="cyan">📁 {folderName}</Text>
              <Text color="gray"> │ </Text>
            </>
          )}
          <Text color="yellow">🤖 {model}</Text>
          {tier && (
            <>
              <Text color="gray"> </Text>
              <Text color="green" dimColor>
                [{tier}]
              </Text>
            </>
          )}
          <Text color="gray"> │ </Text>
          <Text color="gray">Perm: {permColor}</Text>
        </Box>

        <Box>
          <Text color={isIdle ? "green" : "yellow"} bold>
            {isIdle ? "● " : "⠋ "}
          </Text>
          <Text color={isIdle ? "green" : "cyan"} bold>
            {status}
          </Text>
        </Box>
      </Box>

      {/* Helpful shortcuts footer */}
      <Box justifyContent="center" marginTop={0}>
        <Text color="gray" dimColor>
          Ctrl+C Exit  •  /undo Revert changes  •  /help View commands
        </Text>
      </Box>
    </Box>
  );
};
