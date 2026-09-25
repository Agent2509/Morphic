import React from "react";
import { Box, Text } from "ink";

export interface ToolBadgeProps {
  toolName: string;
  args?: any;
  result?: { success: boolean; output: string };
  content?: string;
}

export const ToolBadge: React.FC<ToolBadgeProps> = ({
  toolName,
  args,
  result,
  content,
}) => {
  const isDone = Boolean(result);
  const isSuccess = result?.success !== false;

  let icon = "⚙";
  let label = toolName;
  let detail = content || "";

  if (toolName === "read_file") {
    icon = "📖";
    label = "Read";
    const filePath = args?.path || "file";
    const lineCount = result?.output ? result.output.split("\n").length : undefined;
    detail = lineCount ? `${filePath} (${lineCount} lines)` : filePath;
  } else if (toolName === "grep_search") {
    icon = "🔍";
    label = "Grep";
    const query = args?.query || "";
    const matchCount = result?.output ? result.output.split("\n").filter(Boolean).length : undefined;
    detail = matchCount !== undefined ? `"${query}" (${matchCount} matches)` : `"${query}"`;
  } else if (toolName === "repo_map") {
    icon = "🗺️";
    label = "Repo Map";
    detail = args?.path || "codebase";
  } else if (toolName === "lsp_query") {
    icon = "🔎";
    label = "LSP";
    detail = `${args?.action || "query"} ${args?.file || ""}`;
  } else if (toolName === "smart_router") {
    icon = "🧭";
    label = "SmartRouter";
    detail = content || "";
  } else if (toolName.startsWith("tribe_")) {
    const role = toolName.replace("tribe_", "").toUpperCase();
    icon = "🛡️";
    label = `Agent ${role}`;
    detail = content || "active";
  }

  return (
    <Box marginY={0}>
      <Text color={isDone ? (isSuccess ? "green" : "red") : "yellow"}>
        {" "}
        {isDone ? (isSuccess ? "✔" : "✖") : icon}{" "}
      </Text>
      <Text color="gray" bold>
        {label}{" "}
      </Text>
      <Text color="gray">
        {detail.length > 90 ? `${detail.slice(0, 87)}...` : detail}
      </Text>
    </Box>
  );
};
