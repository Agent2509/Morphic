import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { ConfigStore, type MorphicConfig } from "@morphic/core";
import type { HardwareProfile } from "@morphic/calibration";
import type { ThemeName } from "../theme.js";

import { WelcomeStep } from "./setup/WelcomeStep.js";
import { HardwareScanStep } from "./setup/HardwareScanStep.js";
import { TierRevealStep } from "./setup/TierRevealStep.js";
import { ThemeSelectStep } from "./setup/ThemeSelectStep.js";
import { ProviderSelectStep, type ProviderChoice } from "./setup/ProviderSelectStep.js";
import { ModelSelectStep } from "./setup/ModelSelectStep.js";
import { SummaryStep } from "./setup/SummaryStep.js";

export type WizardStep =
  | "welcome"
  | "scan"
  | "tier"
  | "theme"
  | "provider"
  | "model"
  | "summary";

export interface SetupWizardProps {
  onComplete: (config: MorphicConfig, profile?: HardwareProfile) => void;
  onExit?: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  onComplete,
  onExit,
}) => {
  const [step, setStep] = useState<WizardStep>("welcome");
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [chosenTheme, setChosenTheme] = useState<ThemeName>("cyberpunk");
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>("ollama");
  const [primaryModel, setPrimaryModel] = useState<string>("qwen2.5-coder:7b");
  const [fallbackProvider, setFallbackProvider] = useState<string | undefined>();
  const [fallbackModel, setFallbackModel] = useState<string | undefined>();
  const [apiKey, setApiKey] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null);

  const configStore = new ConfigStore();

  useInput((_input, key) => {
    if (key.escape && onExit) {
      onExit();
    }
  });

  const handleSkipWithDefaults = async () => {
    const savedConfig: Partial<MorphicConfig> = {
      theme: "cyberpunk",
      provider: "ollama",
      model: "qwen2.5-coder:7b",
      setupCompleted: true,
    };
    try {
      await configStore.save(savedConfig);
      const full = await configStore.load();
      onComplete(full, profile || undefined);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save configuration.");
    }
  };

  const handleFinish = async () => {
    const finalProvider: "ollama" | "deepseek" | "openai" | "anthropic" =
      providerChoice === "deepseek" ? "deepseek" : "ollama";

    const updates: Partial<MorphicConfig> = {
      theme: chosenTheme,
      provider: finalProvider,
      model: primaryModel,
      fallbackProvider,
      fallbackModel,
      setupCompleted: true,
    };

    if (apiKey) {
      updates.apiKeys = {
        deepseek: apiKey,
      };
    }

    try {
      await configStore.save(updates);
      const full = await configStore.load();
      onComplete(full, profile || undefined);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save configuration.");
    }
  };

  return (
    <Box flexDirection="column">
      {saveError && (
        <Box paddingX={1} marginY={1}>
          <Text color="red">✖ {saveError} (press Esc to exit)</Text>
        </Box>
      )}
      {step === "welcome" && (
        <WelcomeStep
          onNext={() => setStep("scan")}
          onSkip={handleSkipWithDefaults}
        />
      )}

      {step === "scan" && (
        <HardwareScanStep
          onComplete={(p) => {
            setProfile(p);
            setPrimaryModel(p.runtimeConfig.primaryLocalModel || "qwen2.5-coder:7b");
            setStep("tier");
          }}
          onBack={() => setStep("welcome")}
        />
      )}

      {step === "tier" && profile && (
        <TierRevealStep
          profile={profile}
          onNext={() => setStep("theme")}
          onBack={() => setStep("scan")}
        />
      )}

      {step === "theme" && (
        <ThemeSelectStep
          initialTheme={chosenTheme}
          onSelect={(t) => {
            setChosenTheme(t);
            setStep("provider");
          }}
          onBack={() => setStep(profile ? "tier" : "welcome")}
        />
      )}

      {step === "provider" && profile && (
        <ProviderSelectStep
          profile={profile}
          initialChoice={providerChoice}
          onSelect={(choice) => {
            setProviderChoice(choice);
            setStep("model");
          }}
          onBack={() => setStep("theme")}
        />
      )}

      {step === "model" && profile && (
        <ModelSelectStep
          profile={profile}
          providerChoice={providerChoice}
          onComplete={(data) => {
            setPrimaryModel(data.model);
            setFallbackProvider(data.fallbackProvider);
            setFallbackModel(data.fallbackModel);
            setApiKey(data.apiKey);
            setStep("summary");
          }}
          onBack={() => setStep("provider")}
        />
      )}

      {step === "summary" && profile && (
        <SummaryStep
          data={{
            profile,
            theme: chosenTheme,
            provider: providerChoice === "deepseek" ? "deepseek" : "ollama",
            model: primaryModel,
            fallbackProvider,
            fallbackModel,
            apiKey,
          }}
          onFinish={handleFinish}
          onBack={() => setStep("model")}
        />
      )}
    </Box>
  );
};
