import React from "react";
import { Box, Text, useInput } from "ink";
import type { HardwareProfile } from "@morphic/calibration";
import { THEMES, type ThemeName } from "../../theme.js";

export interface SetupSummaryData {
  profile: HardwareProfile;
  theme: ThemeName;
  provider: "ollama" | "deepseek" | "openai" | "anthropic";
  model: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  apiKey?: string;
}

export interface SummaryStepProps {
  data: SetupSummaryData;
  onFinish: () => void;
  onBack?: () => void;
}

export const SummaryStep: React.FC<SummaryStepProps> = ({
  data,
  onFinish,
  onBack,
}) => {
  useInput((input, key) => {
    if (key.return || input === " ") {
      onFinish();
    } else if (key.leftArrow || input === "b") {
      onBack?.();
    }
  });

  const themeDef = THEMES[data.theme] || THEMES.cyberpunk;

  return (
    <Box flexDirection="column" paddingX={1} marginY={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        padding={1}
      >
        <Box marginBottom={1}>
          <Text color="green" bold>
            🎉 Step 6 of 6: Setup Complete!
          </Text>
        </Box>

        <Text color="white">
          Morphic is fully calibrated and tailored to your laptop:
        </Text>

        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          padding={1}
          marginY={1}
        >
          <Box flexDirection="row">
            <Text color="gray">Hardware Profile: </Text>
            <Text color="yellow" bold>
              {data.profile.tier} ({data.profile.tierName})
            </Text>
            <Text color="dim">
              {" "}— {data.profile.hardware.cpu.cores}c/{data.profile.hardware.cpu.threads}t, {data.profile.hardware.ram.totalGb}GB RAM
            </Text>
          </Box>

          <Box flexDirection="row">
            <Text color="gray">UI Theme:         </Text>
            <Text color={themeDef.colors.primary as any} bold>
              {themeDef.name}
            </Text>
          </Box>

          <Box flexDirection="row">
            <Text color="gray">Primary Provider: </Text>
            <Text color="cyan" bold>
              {data.provider.toUpperCase()}
            </Text>
          </Box>

          <Box flexDirection="row">
            <Text color="gray">Primary Model:    </Text>
            <Text color="white" bold>
              {data.model}
            </Text>
          </Box>

          {data.fallbackProvider && (
            <Box flexDirection="row">
              <Text color="gray">Cloud Fallback:   </Text>
              <Text color="magenta" bold>
                {data.fallbackProvider} ({data.fallbackModel})
              </Text>
            </Box>
          )}

          <Box flexDirection="row">
            <Text color="gray">Agent Pipeline:   </Text>
            <Text color="green">
              Adaptive 1/3/5 Roles (Planner ➔ Researcher ➔ Coder ➔ Reviewer ➔ Tester)
            </Text>
          </Box>

          <Box flexDirection="row">
            <Text color="gray">Safety Sandbox:   </Text>
            <Text color="cyan">
              Rootless Podman + Destructive Command Classifier
            </Text>
          </Box>

          <Box flexDirection="row">
            <Text color="gray">Rollback Engine:  </Text>
            <Text color="cyan">
              Shadow Git Auto-Snapshots (/undo)
            </Text>
          </Box>
        </Box>

        <Box marginY={0}>
          <Text color="dim">
            Configuration saved to ~/.morphic/config.json
          </Text>
          <Text color="dim">
            You can re-run this setup at any time with: <Text color="cyan">morphic setup</Text>
          </Text>
        </Box>

        <Box marginTop={1} justifyContent="space-between">
          <Text color="green" bold>
            Press [Enter] to launch Morphic workspace 🚀
          </Text>
          <Text color="gray">
            [b] Back
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
