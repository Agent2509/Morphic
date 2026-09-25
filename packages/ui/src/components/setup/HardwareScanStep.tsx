import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { calibrateSystem, type HardwareProfile } from "@morphic/calibration";

export interface HardwareScanStepProps {
  onComplete: (profile: HardwareProfile) => void;
  onBack?: () => void;
}

export const HardwareScanStep: React.FC<HardwareScanStepProps> = ({
  onComplete,
  onBack,
}) => {
  const [progressPct, setProgressPct] = useState(5);
  const [message, setMessage] = useState("Initializing hardware profiler...");
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setIsScanning(true);
    setError(null);
    (async () => {
      try {
        const result = await calibrateSystem({
          quick: true,
          saveProjectProfile: false,
          onProgress: (p) => {
            if (mounted) {
              setProgressPct(p.progressPct);
              setMessage(p.message);
            }
          },
        });
        if (mounted) {
          setProfile(result);
          setIsScanning(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Hardware scan failed.");
          setIsScanning(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setAttempt((a) => a + 1);
  }, []);

  useInput((_input, key) => {
    if (key.escape && onBack) {
      onBack();
      return;
    }
    if (isScanning) return;
    if (profile && key.return) {
      onComplete(profile);
    } else if (error && key.return) {
      retry();
    }
  });

  const progressBarWidth = 36;
  const filledChars = Math.round((progressPct / 100) * progressBarWidth);
  const emptyChars = Math.max(0, progressBarWidth - filledChars);
  const bar = `[${"█".repeat(filledChars)}${" ".repeat(emptyChars)}] ${progressPct}%`;

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
            🔍 Step 1 of 6: Hardware Discovery & Benchmarking
          </Text>
        </Box>

        <Box flexDirection="row" marginBottom={1}>
          <Text color="white">{bar} </Text>
          <Text color="gray">{message}</Text>
        </Box>

        {error && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="red">✖ {error}</Text>
            <Text color="yellow">Press [Enter] to retry, or [Esc] to go back.</Text>
          </Box>
        )}

        {profile && !error && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="green" bold>
              ✔ Discovered System Specifications:
            </Text>
            <Box flexDirection="column" marginY={1} paddingLeft={2}>
              <Text color="white">
                • CPU: <Text color="cyan">{profile.hardware.cpu.model}</Text> ({profile.hardware.cpu.cores} cores / {profile.hardware.cpu.threads} threads)
              </Text>
              <Text color="white">
                • RAM: <Text color="cyan">{profile.hardware.ram.totalGb} GB</Text> total ({profile.hardware.ram.availableGb} GB available)
              </Text>
              <Text color="white">
                • GPU: <Text color="cyan">{profile.hardware.gpu.model || profile.hardware.gpu.vendor}</Text> ({profile.hardware.gpu.type})
              </Text>
              <Text color="white">
                • Disk: <Text color="cyan">{profile.hardware.disk.type.toUpperCase()}</Text> ({profile.hardware.disk.freeGb} GB free of {profile.hardware.disk.totalGb} GB)
              </Text>
              <Text color="white">
                • OS: <Text color="cyan">{profile.hardware.os.distro}</Text> ({profile.hardware.os.platform}, container: {profile.hardware.os.containerRuntime || "none"})
              </Text>
              <Text color="white">
                • Ollama: <Text color={profile.ollama.installed ? "green" : "yellow"}>{profile.ollama.installed ? "Installed & running" : "Not detected"}</Text>
              </Text>
            </Box>

            <Box marginTop={1}>
              <Text color="green" bold>
                Press [Enter] to reveal your performance tier classification ›
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
