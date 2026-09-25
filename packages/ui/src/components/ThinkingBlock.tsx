import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface ThinkingBlockProps {
  isThinking: boolean;
  startTime?: number;
  thoughtText?: string;
  durationMs?: number;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  isThinking,
  startTime,
  thoughtText,
  durationMs,
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isThinking) return;

    const spinnerTimer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    const start = startTime || Date.now();
    const elapsedTimer = setInterval(() => {
      setElapsedSeconds(Number(((Date.now() - start) / 1000).toFixed(1)));
    }, 100);

    return () => {
      clearInterval(spinnerTimer);
      clearInterval(elapsedTimer);
    };
  }, [isThinking, startTime]);

  if (isThinking) {
    return (
      <Box flexDirection="column" marginY={0}>
        <Box>
          <Text color="gray">{SPINNER_FRAMES[frameIndex]} </Text>
          <Text color="gray" italic>
            Thinking ({elapsedSeconds.toFixed(1)}s)...
          </Text>
        </Box>
        {thoughtText && thoughtText.trim().length > 0 && (
          <Box marginLeft={2} marginTop={0}>
            <Text color="gray" dimColor>
              {thoughtText.slice(-120).trim()}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  const finalDuration = durationMs ? (durationMs / 1000).toFixed(1) : undefined;

  return (
    <Box marginY={0}>
      <Text color="gray" dimColor>
        • Thought {finalDuration ? `for ${finalDuration}s` : "complete"}
      </Text>
    </Box>
  );
};
