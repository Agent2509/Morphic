import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../../theme.js";

export interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext, onSkip }) => {
  useInput((input, key) => {
    if (key.return || input === " ") {
      onNext();
    } else if (key.escape) {
      onSkip();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} marginY={1}>
      <Text>{theme.banner}</Text>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        padding={1}
        marginY={1}
      >
        <Text color="cyan" bold>
          🚀 Welcome to Morphic
        </Text>
        <Text color="white">
          A next-generation autonomous AI coding agent that self-calibrates to your hardware.
        </Text>
        <Box marginY={1} flexDirection="column">
          <Text color="dim">
            In the next few steps, Morphic will:
          </Text>
          <Text color="cyan">  1. Scan your CPU, RAM, GPU, and disk capabilities</Text>
          <Text color="cyan">  2. Benchmark local models & classify machine tier (T1-T5)</Text>
          <Text color="cyan">  3. Select your UI theme & visual preferences</Text>
          <Text color="cyan">  4. Configure local (Ollama) or cloud (DeepSeek/OpenAI) providers</Text>
        </Box>
        <Box marginTop={1} justifyContent="space-between">
          <Text color="green" bold>
            Press [Enter] to begin setup
          </Text>
          <Text color="gray">
            [Esc] Skip with automatic defaults
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
