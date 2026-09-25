#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json";
import { registerSetupCommand } from "./commands/setup.js";
import { registerCalibrateCommand } from "./commands/calibrate.js";
import { registerUndoCommand } from "./commands/undo.js";
import { registerHistoryCommand } from "./commands/history.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerRunCommand } from "./commands/run.js";

const program = new Command();

program
  .name("morphic")
  .description("Shape-shifts to your hardware. Codes like a team.")
  .version(pkg.version);

registerSetupCommand(program);
registerCalibrateCommand(program);
registerUndoCommand(program);
registerHistoryCommand(program);
registerMcpCommand(program);
registerServeCommand(program);
registerRunCommand(program);

program.parse(process.argv);
