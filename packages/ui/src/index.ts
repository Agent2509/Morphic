import React from "react";
import { render } from "ink";
import { MorphicApp, type MorphicAppProps } from "./app.js";
import { SetupWizard, type SetupWizardProps } from "./components/SetupWizard.js";

export * from "./theme.js";
export * from "./components/Status.js";
export * from "./components/Stream.js";
export * from "./components/Input.js";
export * from "./components/Permission.js";
export * from "./components/Calibration.js";
export * from "./components/AgentPipeline.js";
export * from "./components/SetupWizard.js";
export * from "./app.js";

export function startUI(props: MorphicAppProps) {
  return render(React.createElement(MorphicApp, props), { exitOnCtrlC: false });
}

export function startSetupWizard(props: SetupWizardProps) {
  return render(React.createElement(SetupWizard, props), { exitOnCtrlC: false });
}
