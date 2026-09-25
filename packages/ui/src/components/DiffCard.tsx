import React from "react";
import { Box, Text } from "ink";

export interface DiffCardProps {
  toolName: "create_file" | "edit_file";
  args: any;
  result?: { success: boolean; output: string };
}

export const DiffCard: React.FC<DiffCardProps> = ({ toolName, args, result }) => {
  const filePath = args?.path || args?.targetFile || "unknown";

  if (toolName === "create_file") {
    const content: string = typeof args?.content === "string" ? args.content : "";
    const lines: string[] = content.split("\n");
    const totalLines = lines.length;
    const previewLines: string[] = lines.slice(0, 10);
    const hiddenCount = totalLines - previewLines.length;

    const isSuccess = result?.success;
    const isError = result && !result.success;

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={isError ? "red" : isSuccess ? "green" : "cyan"}
        paddingX={1}
        marginY={1}
      >
        <Box justifyContent="space-between" marginBottom={1}>
          <Box>
            <Text bold color="green">
              📄 Create{" "}
            </Text>
            <Text bold color="white">
              {filePath}
            </Text>
            <Text color="gray"> ({totalLines} lines)</Text>
          </Box>
          {result && (
            <Text color={isSuccess ? "green" : "red"}>
              {isSuccess ? "✔ Created" : "✖ Failed"}
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          {previewLines.map((line: string, idx: number) => {
            const lineNum = String(idx + 1).padStart(3, " ");
            return (
              <Box key={idx}>
                <Text color="gray">{lineNum} </Text>
                <Text color="green">+ </Text>
                <Text color="white">
                  {line.length > 80 ? `${line.slice(0, 77)}...` : line}
                </Text>
              </Box>
            );
          })}
          {hiddenCount > 0 && (
            <Box marginTop={0}>
              <Text color="gray">    ... {hiddenCount} more lines ...</Text>
            </Box>
          )}
        </Box>

        {isError && (
          <Box marginTop={1}>
            <Text color="red">Error: {result?.output || "Failed to create file"}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // edit_file
  const oldStr: string = typeof args?.oldStr === "string" ? args.oldStr : "";
  const newStr: string = typeof args?.newStr === "string" ? args.newStr : "";
  const oldLines: string[] = oldStr ? oldStr.split("\n") : [];
  const newLines: string[] = newStr ? newStr.split("\n") : [];

  const isSuccess = result?.success;
  const isError = result && !result.success;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isError ? "red" : isSuccess ? "green" : "blue"}
      paddingX={1}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text bold color="blue">
            📝 Edit{" "}
          </Text>
          <Text bold color="white">
            {filePath}
          </Text>
          <Text color="gray">
            {" "}
            (-{oldLines.length} / +{newLines.length} lines)
          </Text>
        </Box>
        {result && (
          <Text color={isSuccess ? "green" : "red"}>
            {isSuccess ? "✔ Applied" : "✖ Failed"}
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        {oldLines.slice(0, 6).map((line: string, idx: number) => (
          <Box key={`del_${idx}`}>
            <Text color="red">- </Text>
            <Text color="red">
              {line.length > 80 ? `${line.slice(0, 77)}...` : line}
            </Text>
          </Box>
        ))}
        {oldLines.length > 6 && (
          <Text color="gray">  ... {oldLines.length - 6} more removed lines ...</Text>
        )}

        {newLines.slice(0, 8).map((line: string, idx: number) => (
          <Box key={`add_${idx}`}>
            <Text color="green">+ </Text>
            <Text color="green">
              {line.length > 80 ? `${line.slice(0, 77)}...` : line}
            </Text>
          </Box>
        ))}
        {newLines.length > 8 && (
          <Text color="gray">  ... {newLines.length - 8} more added lines ...</Text>
        )}
      </Box>

      {isError && (
        <Box marginTop={1}>
          <Text color="red">Error: {result?.output || "Failed to apply edit"}</Text>
        </Box>
      )}
    </Box>
  );
};
