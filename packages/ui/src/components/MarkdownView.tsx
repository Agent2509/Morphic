import React from "react";
import { Box, Text } from "ink";
import chalk from "chalk";

export interface MarkdownViewProps {
  content: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  if (!content) return null;

  const lines = content.split("\n");
  const renderedElements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start / end
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End of code block
        inCodeBlock = false;
        const codeText = codeBlockLines.join("\n");
        renderedElements.push(
          <Box
            key={`code_${i}`}
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            marginY={1}
          >
            {codeBlockLang ? (
              <Text color="gray" dimColor>
                {codeBlockLang}
              </Text>
            ) : null}
            <Text color="yellow">{codeText}</Text>
          </Box>
        );
        codeBlockLines = [];
        codeBlockLang = "";
      } else {
        inCodeBlock = true;
        codeBlockLang = line.replace("```", "").trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Markdown Headers
    if (line.startsWith("### ")) {
      renderedElements.push(
        <Box key={`h3_${i}`} marginTop={1} marginBottom={0}>
          <Text color="cyan" bold>
            {line.replace("### ", "◆ ")}
          </Text>
        </Box>
      );
      continue;
    }

    if (line.startsWith("## ")) {
      renderedElements.push(
        <Box key={`h2_${i}`} marginTop={1} marginBottom={0}>
          <Text color="magenta" bold>
            {line.replace("## ", "■ ")}
          </Text>
        </Box>
      );
      continue;
    }

    if (line.startsWith("# ")) {
      renderedElements.push(
        <Box key={`h1_${i}`} marginTop={1} marginBottom={0}>
          <Text color="blue" bold underline>
            {line.replace("# ", "")}
          </Text>
        </Box>
      );
      continue;
    }

    // Bullet points & numbers
    if (/^\s*[-*]\s+/.test(line)) {
      const formatted = line.replace(/^\s*[-*]\s+/, "  • ");
      renderedElements.push(
        <Box key={`bullet_${i}`} marginY={0}>
          <Text color="white">{formatInlineStyles(formatted)}</Text>
        </Box>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      renderedElements.push(
        <Box key={`num_${i}`} marginY={0}>
          <Text color="white">{formatInlineStyles(line)}</Text>
        </Box>
      );
      continue;
    }

    // Regular text lines
    if (line.trim().length === 0) {
      renderedElements.push(<Box key={`empty_${i}`} marginY={0} />);
      continue;
    }

    renderedElements.push(
      <Box key={`text_${i}`} marginY={0}>
        <Text color="white">{formatInlineStyles(line)}</Text>
      </Box>
    );
  }

  // If ended while still in code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    renderedElements.push(
      <Box
        key="code_end"
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginY={1}
      >
        <Text color="yellow">{codeBlockLines.join("\n")}</Text>
      </Box>
    );
  }

  return <Box flexDirection="column">{renderedElements}</Box>;
};

function formatInlineStyles(text: string): string {
  // Bold **text** -> chalk.bold
  let out = text.replace(/\*\*(.*?)\*\*/g, (_, match) => chalk.bold(match));
  // Inline code `code` -> chalk.yellow
  out = out.replace(/`([^`]+)`/g, (_, match) => chalk.yellow(match));
  return out;
}
