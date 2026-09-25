import React from "react";
import { Box, Text } from "ink";
import chalk from "chalk";

export interface LogEntry {
  id: string;
  type: "user" | "assistant" | "tool_call" | "tool_result" | "error";
  content: string;
  toolName?: string;
  success?: boolean;
}

export interface StreamProps {
  logs: LogEntry[];
  currentStream: string;
}

export const Stream: React.FC<StreamProps> = ({ logs, currentStream }) => {
  return (
    <Box flexDirection="column" marginY={1}>
      {logs.map((log) => {
        if (log.type === "user") {
          return (
            <Box key={log.id} marginY={0}>
              <Text color="cyan" bold>
                User:{" "}
              </Text>
              <Text color="white">{log.content}</Text>
            </Box>
          );
        }

        if (log.type === "tool_call") {
          return (
            <Box key={log.id} marginY={0}>
              <Text color="yellow">  ⚙ Calling </Text>
              <Text color="white" bold>
                {log.toolName}
              </Text>
              <Text color="gray">({log.content.slice(0, 80)})</Text>
            </Box>
          );
        }

        if (log.type === "tool_result") {
          const icon = log.success ? chalk.green("✔") : chalk.red("✖");
          return (
            <Box key={log.id} marginY={0}>
              <Text>  {icon} </Text>
              <Text color="gray">
                {log.content.split("\n")[0]?.slice(0, 100) || "Success"}
              </Text>
            </Box>
          );
        }

        if (log.type === "assistant") {
          return (
            <Box key={log.id} marginY={0} flexDirection="column">
              <Text color="magenta" bold>
                Morphic:
              </Text>
              <Text color="white">{log.content}</Text>
            </Box>
          );
        }

        if (log.type === "error") {
          return (
            <Box key={log.id} marginY={0}>
              <Text color="red" bold>
                Error:{" "}
              </Text>
              <Text color="red">{log.content}</Text>
            </Box>
          );
        }

        return null;
      })}

      {currentStream.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="magenta" bold>
            Morphic:
          </Text>
          <Text color="white">{currentStream}</Text>
        </Box>
      )}
    </Box>
  );
};
