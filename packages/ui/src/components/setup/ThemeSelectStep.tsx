import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { THEMES, type ThemeName } from "../../theme.js";

export interface ThemeSelectStepProps {
  initialTheme?: ThemeName;
  onSelect: (theme: ThemeName) => void;
  onBack?: () => void;
}

const themeOptions: ThemeName[] = ["cyberpunk", "minimal", "ocean", "sunset"];

export const ThemeSelectStep: React.FC<ThemeSelectStepProps> = ({
  initialTheme = "cyberpunk",
  onSelect,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = themeOptions.indexOf(initialTheme);
    return idx >= 0 ? idx : 0;
  });

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : themeOptions.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < themeOptions.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      onSelect(themeOptions[selectedIndex]);
    } else if (key.leftArrow || input === "b") {
      onBack?.();
    }
  });

  const currentTheme = THEMES[themeOptions[selectedIndex]];

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
            🎨 Step 3 of 6: Choose Your Visual Theme
          </Text>
        </Box>

        <Text color="white">
          Use [↑/↓] arrow keys to preview themes, then press [Enter] to select:
        </Text>

        <Box flexDirection="column" marginY={1} paddingLeft={1}>
          {themeOptions.map((tName, idx) => {
            const isSelected = idx === selectedIndex;
            const def = THEMES[tName];
            const bullet = isSelected ? "●" : "○";
            const prefix = isSelected ? "› " : "  ";

            return (
              <Box key={tName} flexDirection="row" marginY={0}>
                <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                  {prefix}{bullet} {def.name.padEnd(12)}
                </Text>
                <Text color="dim"> — {def.description} </Text>
                {tName === "cyberpunk" && (
                  <Text color="yellow"> (Recommended)</Text>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Live Theme Preview Box */}
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={currentTheme.colors.border as any}
          padding={1}
          marginY={1}
        >
          <Text color="dim">Preview: [{currentTheme.name}]</Text>
          <Box flexDirection="row" marginTop={1}>
            <Text color={currentTheme.colors.primary as any} bold>
              Morphic Agent
            </Text>
            <Text color="gray"> │ </Text>
            <Text color={currentTheme.colors.accent as any}>
              [T4 Power]
            </Text>
            <Text color="gray"> │ </Text>
            <Text color={currentTheme.colors.success as any}>
              Status: Ready
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={currentTheme.colors.primary as any}>
              ▶ planner
            </Text>
            <Text color="gray"> ➔ </Text>
            <Text color={currentTheme.colors.accent as any}>
              💻 coder
            </Text>
            <Text color="gray"> ➔ </Text>
            <Text color={currentTheme.colors.success as any}>
              🧪 tester
            </Text>
          </Box>
        </Box>

        <Box marginTop={1} justifyContent="space-between">
          <Text color="green" bold>
            Press [Enter] to confirm theme ›
          </Text>
          <Text color="gray">
            [b] Back
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
