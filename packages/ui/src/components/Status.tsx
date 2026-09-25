import React from "react";
import { Box, Text } from "ink";
import chalk from "chalk";

export interface StatusProps {
  status: string;
  provider: string;
  model: string;
  permissionLevel: number;
  tier?: string;
}

export const Status: React.FC<StatusProps> = ({
  status,
  provider,
  model,
  permissionLevel,
  tier,
}) => {
  const permBadge = `L${permissionLevel}`;
  const permColor =
    permissionLevel === 1
      ? chalk.red(permBadge)
      : permissionLevel === 2
      ? chalk.yellow(permBadge)
      : permissionLevel === 3
      ? chalk.blue(permBadge)
      : chalk.green(permBadge);

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
      marginTop={1}
    >
      <Box>
        <Text color="cyan" bold>
          Morphic
        </Text>
        {tier && (
          <>
            <Text color="gray"> │ </Text>
            <Text color="green" bold>[{tier}]</Text>
          </>
        )}
        <Text color="gray"> │ </Text>
        <Text color="yellow">{provider}</Text>
        <Text color="gray">:</Text>
        <Text color="white">{model}</Text>
        <Text color="gray"> │ </Text>
        <Text color="magenta">Perm: {permColor}</Text>
      </Box>
      <Box>
        <Text color="gray">Status: </Text>
        <Text color={status === "Idle" ? "green" : "cyan"} bold>
          {status}
        </Text>
      </Box>
    </Box>
  );
};
