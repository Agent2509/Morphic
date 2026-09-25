import chalk from "chalk";

export type ThemeName = "cyberpunk" | "minimal" | "ocean" | "sunset";

export interface ThemeColors {
  primary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
  border: string;
}

export interface ThemeDefinition {
  id: ThemeName;
  name: string;
  description: string;
  colors: ThemeColors;
  bannerColor: (text: string) => string;
}

export const THEMES: Record<ThemeName, ThemeDefinition> = {
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Vibrant neon cyan & magenta (Default)",
    colors: {
      primary: "cyan",
      accent: "magenta",
      success: "green",
      warning: "yellow",
      error: "red",
      muted: "gray",
      border: "cyan",
    },
    bannerColor: (t) => chalk.cyan.bold(t),
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Clean monochrome & subtle grays",
    colors: {
      primary: "white",
      accent: "gray",
      success: "green",
      warning: "yellow",
      error: "red",
      muted: "gray",
      border: "gray",
    },
    bannerColor: (t) => chalk.white.bold(t),
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    description: "Deep oceanic blue & bright seafoam teal",
    colors: {
      primary: "blue",
      accent: "cyan",
      success: "green",
      warning: "yellow",
      error: "red",
      muted: "gray",
      border: "blue",
    },
    bannerColor: (t) => chalk.blue.bold(t),
  },
  sunset: {
    id: "sunset",
    name: "Sunset",
    description: "Warm amber yellow & blazing orange-red",
    colors: {
      primary: "yellow",
      accent: "red",
      success: "green",
      warning: "yellow",
      error: "red",
      muted: "gray",
      border: "yellow",
    },
    bannerColor: (t) => chalk.yellow.bold(t),
  },
};

export function getTheme(name?: ThemeName): ThemeDefinition {
  if (name && THEMES[name]) {
    return THEMES[name];
  }
  return THEMES.cyberpunk;
}

export function buildBanner(themeDef: ThemeDefinition = THEMES.cyberpunk): string {
  const c = themeDef.bannerColor;
  return `
 ${c("███╗   ███╗ ██████╗ ██████╗ ██████╗ ██╗  ██╗██╗ ██████╗")}
 ${c("████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██║  ██║██║██╔════╝")}
 ${c("██╔████╔██║██║   ██║██████╔╝██████╔╝███████║██║██║     ")}
 ${c("██║╚██╔╝██║██║   ██║██╔══██╗██╔═══╝ ██╔══██║██║██║     ")}
 ${c("██║ ╚═╝ ██║╚██████╔╝██║  ██║██║     ██║  ██║██║╚██████╗")}
 ${c("╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝ ╚═════╝")}
 ${chalk.dim("Shape-shifts to your hardware. Codes like a team.")}
`;
}

export const theme = {
  colors: {
    primary: chalk.cyan,
    accent: chalk.magenta,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    dim: chalk.gray,
    bold: chalk.bold,
  },
  banner: buildBanner(THEMES.cyberpunk),
  formatToolCall: (name: string, args: any) => {
    return chalk.cyan(`▶ ${chalk.bold(name)}`) + chalk.dim(` ${JSON.stringify(args)}`);
  },
  formatToolResult: (name: string, success: boolean, summary: string) => {
    const icon = success ? chalk.green("✔") : chalk.red("✖");
    return `${icon} ${chalk.bold(name)}: ${chalk.dim(summary.slice(0, 150))}${summary.length > 150 ? "..." : ""}`;
  },
};
