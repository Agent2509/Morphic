import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface CommandCardProps {
  command: string;
  result?: { success: boolean; output: string };
  durationMs?: number;
}

export const CommandCard: React.FC<CommandCardProps> = ({
  command,
  result,
  durationMs,
}) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (result) return;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, [result]);

  const isRunning = !result;
  const isSuccess = result?.success;
  const output = result?.output?.trim() || "";
  const lines = output ? output.split("\n") : [];
  const maxDisplayLines = 10;
  const previewLines = lines.slice(0, maxDisplayLines);
  const hiddenCount = lines.length - previewLines.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isRunning ? "yellow" : isSuccess ? "gray" : "red"}
      paddingX={1}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={output ? 1 : 0}>
        <Box>
          <Text bold color="yellow">
            $
          </Text>
          <Text bold color="white">
            {" "}
            {command}
          </Text>
        </Box>
        {isRunning ? (
          <Text color="yellow">{SPINNER_FRAMES[frameIndex]} running</Text>
        ) : (
          <Box>
            <Text color={isSuccess ? "green" : "red"}>
              {isSuccess ? "✔ exit 0" : "✖ failed"}
            </Text>
            {durationMs !== undefined && (
              <Text color="gray"> ({durationMs}ms)</Text>
            )}
          </Box>
        )}
      </Box>

      {output.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          {previewLines.map((line, idx) => (
            <Text key={idx} color={isSuccess ? "gray" : "red"}>
              {line.length > 100 ? `${line.slice(0, 97)}...` : line}
            </Text>
          ))}
          {hiddenCount > 0 && (
            <Text color="gray" dimColor>
              ... {hiddenCount} more lines ...
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};
