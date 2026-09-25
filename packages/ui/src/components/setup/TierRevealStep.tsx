import React from "react";
import { Box, Text, useInput } from "ink";
import type { HardwareProfile } from "@morphic/calibration";

export interface TierRevealStepProps {
  profile: HardwareProfile;
  onNext: () => void;
  onBack?: () => void;
}

export const TierRevealStep: React.FC<TierRevealStepProps> = ({
  profile,
  onNext,
  onBack,
}) => {
  useInput((input, key) => {
    if (key.return || input === " ") {
      onNext();
    } else if (key.leftArrow || input === "b") {
      onBack?.();
    }
  });

  const getTierDescription = (tier: string) => {
    switch (tier) {
      case "T1":
        return {
          headline: "Cloud-Optimized (Minimal Hardware)",
          desc: "Your machine has limited RAM or CPU cores. Morphic will run in Single-Agent mode and route complex tasks to cloud providers (DeepSeek/OpenAI) for lightning speed.",
          color: "blue",
        };
      case "T2":
        return {
          headline: "Lightweight Developer Laptop",
          desc: "Your machine can run fast 3B-7B models (like qwen2.5-coder:3b or llama3.2:3b) locally for daily tasks, scaling up to 3 agents (Planner ➔ Coder ➔ Tester).",
          color: "cyan",
        };
      case "T3":
        return {
          headline: "Balanced Developer Machine",
          desc: "Great specs! You can run 7B-8B coder models (like qwen2.5-coder:7b or llama3.1:8b) completely on-device with 3 to 5 agents.",
          color: "green",
        };
      case "T4":
        return {
          headline: "Power Workstation",
          desc: "Exceptional computing power! You can run 7B-14B models locally with the full 5-agent pipeline (Planner ➔ Researcher ➔ Coder ➔ Reviewer ➔ Tester) with zero cloud reliance for ~95% of tasks.",
          color: "green",
        };
      case "T5":
        return {
          headline: "Beast Multi-GPU Rig",
          desc: "Maximum tier! High VRAM and massive RAM headroom. Morphic unlocks parallel multi-agent execution and can run 32B-70B models completely local.",
          color: "magenta",
        };
      default:
        return {
          headline: "Standard Configuration",
          desc: "Balanced local and cloud capabilities configured for your hardware.",
          color: "cyan",
        };
    }
  };

  const info = getTierDescription(profile.tier);

  return (
    <Box flexDirection="column" paddingX={1} marginY={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        padding={1}
      >
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            🏆 Step 2 of 6: Machine Classification
          </Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor={info.color as any}
          padding={1}
          marginY={1}
        >
          <Box flexDirection="row" alignItems="center">
            <Text color="yellow" bold>
              CLASSIFICATION:{" "}
            </Text>
            <Text color={info.color as any} bold>
              [{profile.tier} — {profile.tierName.toUpperCase()}]
            </Text>
          </Box>
          <Box marginY={1}>
            <Text color="white" bold>
              {info.headline}
            </Text>
          </Box>
          <Text color="dim">{info.desc}</Text>
        </Box>

        <Box flexDirection="column" marginY={1} paddingLeft={1}>
          <Text color="white" bold>
            Recommended Setup for your hardware:
          </Text>
          <Text color="dim">
            • Primary Local Model: <Text color="cyan">{profile.runtimeConfig.primaryLocalModel}</Text>
          </Text>
          <Text color="dim">
            • Fast Helper Model:   <Text color="cyan">{profile.runtimeConfig.fastLocalModel}</Text>
          </Text>
          <Text color="dim">
            • Context Window:      <Text color="cyan">{profile.runtimeConfig.contextWindow.toLocaleString()} tokens</Text>
          </Text>
          <Text color="dim">
            • Cloud Fallback:      <Text color="cyan">{profile.runtimeConfig.cloudFallbackModel}</Text>
          </Text>
        </Box>

        <Box marginTop={1} justifyContent="space-between">
          <Text color="green" bold>
            Press [Enter] to choose visual theme ›
          </Text>
          <Text color="gray">
            [b] Back
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
