import * as vscode from "vscode";
import { spawn, type ChildProcess } from "node:child_process";

let acpProcess: ChildProcess | null = null;

export function activate(context: vscode.ExtensionContext) {
  let activeSessionId: string | null = null;
  let requestId = 1;
  let buffer = "";
  let currentWebview: vscode.Webview | undefined;
  const pending = new Map<number, (msg: any) => void>();
  const outputChannel = vscode.window.createOutputChannel("Morphic");
  context.subscriptions.push(outputChannel);

  function handleLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      outputChannel.appendLine(line);
      return;
    }

    if (msg.method === "session/token" && msg.params?.token) {
      currentWebview?.postMessage({ type: "token", token: msg.params.token });
      return;
    }

    if (msg.id !== undefined && pending.has(msg.id)) {
      const resolve = pending.get(msg.id)!;
      pending.delete(msg.id);
      resolve(msg);
    }
  }

  function rpc(proc: ChildProcess, method: string, params: unknown): Promise<any> {
    const id = requestId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  async function ensureServer(): Promise<ChildProcess> {
    if (acpProcess) return acpProcess;

    if (!vscode.workspace.isTrusted) {
      throw new Error("Workspace is not trusted; refusing to launch the Morphic server.");
    }

    const config = vscode.workspace.getConfiguration("morphic");
    const serverPath = config.get<string>("serverPath", "morphic");
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    const proc = spawn(serverPath, ["serve", "--stdio"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) handleLine(line.trim());
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      outputChannel.appendLine(chunk.toString("utf-8").trim());
    });

    proc.on("exit", () => {
      if (acpProcess === proc) acpProcess = null;
      activeSessionId = null;
    });

    acpProcess = proc;

    await rpc(proc, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "morphic-vscode", version: "0.1.0" },
    });

    const newSession = await rpc(proc, "session/new", {
      cwd,
      permissionLevel: config.get<number>("permissionLevel", 2),
    });
    activeSessionId = newSession?.result?.sessionId ?? null;

    return proc;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("morphic.start", () => {
      vscode.commands.executeCommand("workbench.view.extension.morphic-sidebar-view");
    }),

    vscode.commands.registerCommand("morphic.calibrate", async () => {
      const terminal = vscode.window.createTerminal("Morphic Calibration");
      terminal.show();
      terminal.sendText("morphic calibrate");
    }),

    vscode.commands.registerCommand("morphic.undo", async () => {
      const terminal = vscode.window.createTerminal("Morphic Undo");
      terminal.show();
      terminal.sendText("morphic undo");
    })
  );

  const chatViewProvider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView: vscode.WebviewView) {
      webviewView.webview.options = { enableScripts: true };
      currentWebview = webviewView.webview;

      webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Morphic Chat</title>
  <style>
    body { font-family: sans-serif; padding: 10px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    #chat { height: 75vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .msg { padding: 8px 12px; border-radius: 6px; white-space: pre-wrap; }
    .user { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); align-self: flex-end; }
    .assistant { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; }
    .error { background: var(--vscode-inputValidation-errorBackground); align-self: flex-start; }
    #inputBox { display: flex; gap: 6px; margin-top: 10px; }
    input { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
    button { padding: 8px 14px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="chat">
    <div class="msg assistant">Morphic is ready. How can I help code your project?</div>
  </div>
  <div id="inputBox">
    <input type="text" id="prompt" placeholder="Ask Morphic to write, refactor, or test code..." />
    <button id="sendBtn">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById("chat");
    const promptInput = document.getElementById("prompt");
    const sendBtn = document.getElementById("sendBtn");

    function append(className, text) {
      const div = document.createElement("div");
      div.className = "msg " + className;
      div.innerText = text;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      return div;
    }

    sendBtn.addEventListener("click", () => {
      const text = promptInput.value.trim();
      if (!text) return;
      promptInput.value = "";
      append("user", text);
      vscode.postMessage({ command: "prompt", text });
    });

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "token") {
        let last = chat.querySelector(".msg.assistant[data-streaming='true']");
        if (!last) {
          last = append("assistant", "");
          last.setAttribute("data-streaming", "true");
        }
        last.innerText += msg.token;
      } else if (msg.type === "final") {
        const streaming = chat.querySelector(".msg.assistant[data-streaming='true']");
        if (streaming) streaming.removeAttribute("data-streaming");
        else if (msg.text) append("assistant", msg.text);
      } else if (msg.type === "error") {
        append("error", "Error: " + msg.text);
      }
    });
  </script>
</body>
</html>`;

      webviewView.webview.onDidReceiveMessage(async (data: { command?: string; text?: string }) => {
        if (data.command !== "prompt" || !data.text) return;
        try {
          const response = await send("session/prompt", {
            sessionId: activeSessionId ?? "",
            prompt: data.text,
          });
          const text = response?.result?.output || response?.error?.message || "";
          currentWebview?.postMessage({ type: "final", text });
        } catch (err: any) {
          currentWebview?.postMessage({ type: "error", text: err?.message || String(err) });
        }
      });
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("morphic.chatView", chatViewProvider)
  );

  async function send(method: string, params: unknown): Promise<any> {
    const proc = await ensureServer();
    return rpc(proc, method, params);
  }
}

export function deactivate() {
  if (acpProcess) {
    acpProcess.kill("SIGTERM");
    const proc = acpProcess;
    const timer = setTimeout(() => proc.kill("SIGKILL"), 2000);
    timer.unref?.();
    acpProcess = null;
  }
}
