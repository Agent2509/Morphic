import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { HardwareProfile } from "@morphic/calibration";

export type ProviderChoice = "ollama" | "deepseek" | "hybrid";

export interface ProviderSelectStepProps {
  profile: HardwareProfile;
  initialChoice?: ProviderChoice;
  onSelect: (choice: ProviderChoice) => void;
  onBack?: () => void;
}

interface ProviderOption {
  id: ProviderChoice;
  title: string;
  desc: string;
  badge?: string;
}

export const ProviderSelectStep: React.FC<ProviderSelectStepProps> = ({
  profile,
  initialChoice = "ollama",
  onSelect,
  onBack,
}) => {
  const isHighEnd = ["T3", "T4", "T5"].includes(profile.tier);

  const options: ProviderOption[] = [
    {
      id: "ollama",
      title: "Local (Ollama)",
      desc: "Runs 100% on your machine. Zero cost, complete privacy, works offline.",
      badge: isHighEnd ? "★ Recommended for your hardware" : undefined,
    },
    {
      id: "hybrid",
      title: "Hybrid (Local + Cloud Fallback)",
      desc: "Runs simple tasks on local Ollama; routes heavy planning to DeepSeek API.",
      badge: isHighEnd ? "Popular for power users" : undefined,
    },
    {
      id: "deepseek",
      title: "Cloud-Only (DeepSeek API)",
      desc: "Zero local RAM/GPU usage. Uses DeepSeek Chat & Reasoner over the web.",
      badge: !isHighEnd ? "★ Recommended for lighter hardware" : undefined,
    },
  ];

  const defaultIndex = options.findIndex((o) => o.id === initialChoice);
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex >= 0 ? defaultIndex : 0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      onSelect(options[selectedIndex].id);
    } else if (key.leftArrow || input === "b") {
      onBack?.();
    }
  });

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
            ⚡ Step 4 of 6: Choose Model Provider
          </Text>
        </Box>

        <Text color="white">
          How would you like Morphic to execute inference?
        </Text>

        <Box flexDirection="column" marginY={1} paddingLeft={1}>
          {options.map((opt, idx) => {
            const isSelected = idx === selectedIndex;
            const bullet = isSelected ? "●" : "○";
            const prefix = isSelected ? "› " : "  ";

            return (
              <Box key={opt.id} flexDirection="column" marginY={1}>
                <Box flexDirection="row">
                  <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                    {prefix}{bullet} {opt.title.padEnd(30)}
                  </Text>
                  {opt.badge && (
                    <Text color="yellow" bold>
                      {" "}[{opt.badge}]
                    </Text>
                  )}
                </Box>
                <Box paddingLeft={4}>
                  <Text color="dim">{opt.desc}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1} justifyContent="space-between">
          <Text color="green" bold>
            Press [Enter] to configure model & credentials ›
          </Text>
          <Text color="gray">
            [b] Back
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
