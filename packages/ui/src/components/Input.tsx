import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const Input: React.FC<InputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask Morphic to build, edit, or test anything...",
  disabled = false,
}) => {
  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor={disabled ? "gray" : "cyan"}
      paddingX={1}
      marginTop={1}
    >
      <Text color="cyan" bold>
        ❯{" "}
      </Text>
      {disabled ? (
        <Text color="yellow" italic>
          Agent is working... (Ctrl+C to interrupt)
        </Text>
      ) : (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
        />
      )}
    </Box>
  );
};
