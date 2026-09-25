import React from "react";
import { Box, Text, useInput } from "ink";

export interface PermissionProps {
  toolName: string;
  category: string;
  args: any;
  reason: string;
  onDecision: (decision: "allow" | "deny" | "always") => void;
}

export const PermissionPrompt: React.FC<PermissionProps> = ({
  toolName,
  category,
  args,
  reason,
  onDecision,
}) => {
  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) {
      onDecision("allow");
    } else if (input === "n" || input === "N" || key.escape) {
      onDecision("deny");
    } else if (input === "a" || input === "A") {
      onDecision("always");
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      flexDirection="column"
      paddingX={1}
      marginY={1}
    >
      <Box>
        <Text color="yellow" bold>
          ⚠️ Permission Required:{" "}
        </Text>
        <Text color="white" bold>
          {toolName}
        </Text>
        <Text color="gray"> ({category})</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="dim">{reason}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Parameters:</Text>
        <Text color="gray">
          {JSON.stringify(args, null, 2).slice(0, 300)}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>
          Approve action? [
          <Text color="green" bold>
            y
          </Text>
          ]es / [
          <Text color="red" bold>
            n
          </Text>
          ]o / [
          <Text color="cyan" bold>
            a
          </Text>
          ]lways allow {toolName}
        </Text>
      </Box>
    </Box>
  );
};
