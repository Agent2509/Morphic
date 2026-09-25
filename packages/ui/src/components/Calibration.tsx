import React from "react";
import { Box, Text } from "ink";
import chalk from "chalk";
import type { HardwareProfile } from "@morphic/calibration";

export interface CalibrationViewProps {
  progressPct: number;
  message: string;
  profile: HardwareProfile | null;
}

export const CalibrationView: React.FC<CalibrationViewProps> = ({
  progressPct,
  message,
  profile,
}) => {
  const progressBarWidth = 30;
  const filledChars = Math.round((progressPct / 100) * progressBarWidth);
  const emptyChars = progressBarWidth - filledChars;
  const bar = `[${chalk.cyan("=".repeat(filledChars))}${" ".repeat(emptyChars)}] ${progressPct}%`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginY={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          🔧 Morphic Self-Calibration Engine
        </Text>
      </Box>

      <Box flexDirection="row" marginBottom={1}>
        <Text color="white">{bar} </Text>
        <Text color="gray">{message}</Text>
      </Box>

      {profile && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="green" padding={1}>
          <Box marginBottom={1}>
            <Text color="green" bold>
              ✔ Calibration Completed — Tier Classification:{" "}
            </Text>
            <Text color="yellow" bold>
              {profile.tier} ({profile.tierName})
            </Text>
          </Box>

          <Box flexDirection="column" marginY={0}>
            <Text color="dim">
              CPU: {profile.hardware.cpu.model} ({profile.hardware.cpu.cores} cores / {profile.hardware.cpu.threads} threads)
            </Text>
            <Text color="dim">
              RAM: {profile.hardware.ram.totalGb} GB Total ({profile.hardware.ram.availableGb} GB Available)
            </Text>
            <Text color="dim">
              GPU: {profile.hardware.gpu.model || profile.hardware.gpu.vendor} ({profile.hardware.gpu.type})
            </Text>
            <Text color="dim">
              Disk: {profile.hardware.disk.type.toUpperCase()} ({profile.hardware.disk.freeGb} GB Free)
            </Text>
            <Text color="dim">
              OS: {profile.hardware.os.distro} ({profile.hardware.os.containerRuntime || "no container"})
            </Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color="cyan" bold>
              Engine Configuration:
            </Text>
            <Text color="white">  • Primary Local Model: {profile.runtimeConfig.primaryLocalModel}</Text>
            <Text color="white">  • Fast Local Model:    {profile.runtimeConfig.fastLocalModel}</Text>
            <Text color="white">  • Cloud Fallback:      {profile.runtimeConfig.cloudFallbackModel}</Text>
            <Text color="white">  • Context Window:      {profile.runtimeConfig.contextWindow.toLocaleString()} tokens</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
