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
  placeholder = "Ask Morphic anything...",
  disabled = false,
}) => {
  return (
    <Box marginTop={1} flexDirection="row">
      <Text color="cyan" bold>
        ❯{" "}
      </Text>
      {disabled ? (
        <Text color="gray">Waiting for agent...</Text>
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
