import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { OllamaProvider } from "@morphic/providers";
import type { HardwareProfile } from "@morphic/calibration";
import type { ProviderChoice } from "./ProviderSelectStep.js";

export interface ModelSelectStepProps {
  profile: HardwareProfile;
  providerChoice: ProviderChoice;
  onComplete: (data: {
    model: string;
    fallbackProvider?: string;
    fallbackModel?: string;
    apiKey?: string;
  }) => void;
  onBack?: () => void;
}

export const ModelSelectStep: React.FC<ModelSelectStepProps> = ({
  profile,
  providerChoice,
  onComplete,
  onBack,
}) => {
  const [loading, setLoading] = useState(providerChoice !== "deepseek");
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [subStage, setSubStage] = useState<"pick_model" | "enter_key">(
    providerChoice === "deepseek" ? "enter_key" : "pick_model"
  );
  const [selectedLocalModel, setSelectedLocalModel] = useState(
    profile.runtimeConfig.primaryLocalModel || "qwen2.5-coder:7b"
  );

  useEffect(() => {
    let mounted = true;
    if (providerChoice === "ollama" || providerChoice === "hybrid") {
      (async () => {
        try {
          const provider = new OllamaProvider();
          if (await provider.isAvailable()) {
            const list = await provider.listModels();
            const names = list.map((m) => m.name || m.id).filter(Boolean);
            if (mounted && names.length > 0) {
              setInstalledModels(names);
              // Pre-select recommended model if present
              const rec = profile.runtimeConfig.primaryLocalModel;
              const foundIdx = names.findIndex((n) => n === rec || n.startsWith(rec.split(":")[0]));
              setSelectedIndex(foundIdx >= 0 ? foundIdx : 0);
            }
          }
        } catch {
          // ignore error
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    }
    return () => {
      mounted = false;
    };
  }, [providerChoice, profile]);

  useInput((input, key) => {
    if (subStage === "pick_model") {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, installedModels.length - 1)));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < installedModels.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        const picked = installedModels[selectedIndex] || profile.runtimeConfig.primaryLocalModel;
        setSelectedLocalModel(picked);

        if (providerChoice === "hybrid") {
          setSubStage("enter_key");
        } else {
          onComplete({
            model: picked,
          });
        }
      } else if (key.leftArrow || input === "b") {
        onBack?.();
      }
    }
  });

  const handleApiKeySubmit = (val: string) => {
    const key = val.trim();
    if (providerChoice === "deepseek") {
      onComplete({
        model: "deepseek-chat",
        apiKey: key || undefined,
      });
    } else if (providerChoice === "hybrid") {
      onComplete({
        model: selectedLocalModel,
        fallbackProvider: "deepseek",
        fallbackModel: "deepseek-chat",
        apiKey: key || undefined,
      });
    }
  };

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
            🧠 Step 5 of 6: Model Selection & Credentials
          </Text>
        </Box>

        {loading ? (
          <Text color="gray">Scanning local Ollama models...</Text>
        ) : subStage === "pick_model" ? (
          <Box flexDirection="column">
            <Text color="white">
              Select primary local model for your agent:
            </Text>

            {installedModels.length > 0 ? (
              <Box flexDirection="column" marginY={1} paddingLeft={1}>
                {installedModels.map((mName, idx) => {
                  const isSelected = idx === selectedIndex;
                  const isRecommended =
                    mName === profile.runtimeConfig.primaryLocalModel ||
                    mName.startsWith(profile.runtimeConfig.primaryLocalModel.split(":")[0]);
                  const bullet = isSelected ? "●" : "○";
                  const prefix = isSelected ? "› " : "  ";

                  return (
                    <Box key={mName} flexDirection="row">
                      <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                        {prefix}{bullet} {mName.padEnd(26)}
                      </Text>
                      {isRecommended && (
                        <Text color="yellow" bold>
                          {" "}[★ Recommended for {profile.tier}]
                        </Text>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Box flexDirection="column" marginY={1}>
                <Text color="yellow">
                  No Ollama models detected locally.
                </Text>
                <Text color="dim">
                  Suggested command to run in terminal:{" "}
                  <Text color="cyan">ollama pull {profile.runtimeConfig.primaryLocalModel}</Text>
                </Text>
                <Text color="dim">
                  Using default fallback: {profile.runtimeConfig.primaryLocalModel}
                </Text>
              </Box>
            )}

            <Box marginTop={1} justifyContent="space-between">
              <Text color="green" bold>
                Press [Enter] to choose highlighted model ›
              </Text>
              <Text color="gray">
                [b] Back
              </Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text color="white" bold>
              Cloud Provider API Key (DeepSeek)
            </Text>
            <Text color="dim">
              {providerChoice === "hybrid"
                ? "Optional: Enter your DEEPSEEK_API_KEY for cloud fallback when tasks are complex (or press Enter to skip):"
                : "Enter your DEEPSEEK_API_KEY to authenticate with DeepSeek API:"}
            </Text>

            <Box marginY={1} borderStyle="single" borderColor="gray" paddingX={1}>
              <Text color="cyan">API Key: </Text>
              <TextInput
                value={apiKeyInput}
                onChange={setApiKeyInput}
                onSubmit={handleApiKeySubmit}
                placeholder="sk-... (press Enter to proceed)"
                mask="*"
              />
            </Box>

            <Box marginTop={1} justifyContent="space-between">
              <Text color="green" bold>
                Press [Enter] to continue ›
              </Text>
              {providerChoice === "hybrid" && (
                <Text color="gray">
                  (Leave blank to use local-only)
                </Text>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
