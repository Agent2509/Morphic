import React from "react";
import { Box, Text } from "ink";
import { DiffCard } from "./DiffCard.js";
import { CommandCard } from "./CommandCard.js";
import { ToolBadge } from "./ToolBadge.js";
import { ThinkingBlock } from "./ThinkingBlock.js";
import { MarkdownView } from "./MarkdownView.js";

export interface LogEntry {
  id: string;
  type: "user" | "assistant" | "tool_call" | "tool_result" | "error" | "thinking";
  content: string;
  toolName?: string;
  success?: boolean;
  args?: any;
  durationMs?: number;
}

export interface StreamProps {
  logs: LogEntry[];
  currentStream: string;
  isThinking?: boolean;
  thinkingStartTime?: number;
}

export const Stream: React.FC<StreamProps> = ({
  logs,
  currentStream,
  isThinking = false,
  thinkingStartTime,
}) => {
  // Build a lookup map of tool results by parent tool call ID
  const resultsByCallId = new Map<string, { success: boolean; output: string }>();
  for (const log of logs) {
    if (log.type === "tool_result") {
      const parentId = log.id.endsWith("_res") ? log.id.replace("_res", "") : log.id;
      resultsByCallId.set(parentId, {
        success: log.success ?? true,
        output: log.content,
      });
    }
  }

  // Track created files so we can deduplicate raw code dumps in chat
  const createdFiles = new Set<string>();
  for (const log of logs) {
    if (log.type === "tool_call" && log.toolName === "create_file") {
      let filePath = log.args?.path;
      if (!filePath && log.content) {
        try {
          const parsed = JSON.parse(log.content);
          filePath = parsed.path;
        } catch {
          // ignore
        }
      }
      if (filePath) createdFiles.add(filePath);
    }
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {logs.map((log) => {
        if (log.type === "user") {
          return (
            <Box key={log.id} marginY={1}>
              <Text color="cyan" bold>
                ❯{" "}
              </Text>
              <Text color="white" bold>
                {log.content}
              </Text>
            </Box>
          );
        }

        if (log.type === "thinking") {
          return (
            <ThinkingBlock
              key={log.id}
              isThinking={false}
              durationMs={log.durationMs}
              thoughtText={log.content}
            />
          );
        }

        if (log.type === "tool_call") {
          const toolName = log.toolName || "tool";
          let parsedArgs = log.args;
          if (!parsedArgs && log.content) {
            try {
              parsedArgs = JSON.parse(log.content);
            } catch {
              parsedArgs = { raw: log.content };
            }
          }

          const result = resultsByCallId.get(log.id);

          if (toolName === "create_file" || toolName === "edit_file") {
            return (
              <DiffCard
                key={log.id}
                toolName={toolName}
                args={parsedArgs}
                result={result}
              />
            );
          }

          if (toolName === "shell_exec") {
            const cmd = parsedArgs?.command || log.content;
            return (
              <CommandCard
                key={log.id}
                command={cmd}
                result={result}
                durationMs={log.durationMs}
              />
            );
          }

          return (
            <ToolBadge
              key={log.id}
              toolName={toolName}
              args={parsedArgs}
              result={result}
              content={log.content}
            />
          );
        }

        if (log.type === "tool_result") {
          // Check if parent call was already rendered with specialized card
          const parentId = log.id.endsWith("_res") ? log.id.replace("_res", "") : log.id;
          const parentCall = logs.find((l) => l.id === parentId);
          if (
            parentCall &&
            (parentCall.toolName === "create_file" ||
              parentCall.toolName === "edit_file" ||
              parentCall.toolName === "shell_exec")
          ) {
            // Already rendered inside DiffCard or CommandCard
            return null;
          }

          // Otherwise render compact badge if not already shown
          return null;
        }

        if (log.type === "assistant") {
          const cleanedContent = filterRedundantCodeDumps(log.content, createdFiles);
          return (
            <Box key={log.id} marginY={1} flexDirection="column">
              <MarkdownView content={cleanedContent} />
            </Box>
          );
        }

        if (log.type === "error") {
          return (
            <Box
              key={log.id}
              borderStyle="round"
              borderColor="red"
              paddingX={1}
              marginY={1}
            >
              <Text color="red" bold>
                Error:{" "}
              </Text>
              <Text color="red">{log.content}</Text>
            </Box>
          );
        }

        return null;
      })}

      {/* Live Thinking Indicator */}
      {isThinking && (
        <Box marginY={1}>
          <ThinkingBlock isThinking={true} startTime={thinkingStartTime} />
        </Box>
      )}

      {/* Live Streaming Content */}
      {currentStream.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <MarkdownView content={currentStream} />
        </Box>
      )}
    </Box>
  );
};

/**
 * If the model printed a massive markdown code block describing the file
 * that was already written by create_file, replace the redundant code dump
 * with a clean concise note so the terminal is not overwhelmed.
 */
function filterRedundantCodeDumps(content: string, createdFiles: Set<string>): string {
  if (createdFiles.size === 0 || !content.includes("```")) {
    return content;
  }

  // If content has huge code block (> 15 lines) and mentions any created file
  return content.replace(
    /```(?:javascript|js|typescript|ts|json|bash|sh)?\n([\s\S]*?)```/g,
    (match, codeBody) => {
      const codeLines = codeBody.split("\n");
      if (codeLines.length > 12) {
        return `*(File contents applied directly — see creation card above)*`;
      }
      return match;
    }
  );
}
