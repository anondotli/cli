import chalk from "chalk";

// Honor NO_COLOR (https://no-color.org/) and dumb terminals (U3)
if (process.env.NO_COLOR !== undefined || process.env.TERM === "dumb") {
  chalk.level = 0;
}

// Brand color: blue
const blue = chalk.hex("#6366F1");
export const brandColor: { (str: string): string; multiline(str: string): string } =
  Object.assign(
    (str: string) => blue(str),
    { multiline: (str: string) => str.split("\n").map((line) => blue(line)).join("\n") },
  );

// Pre-built chalk instances for the brand palette
export const c = {
  // Status
  success: chalk.hex("#10B981"),
  error: chalk.hex("#EF4444"),
  warning: chalk.hex("#F59E0B"),
  info: chalk.hex("#8B5CF6"),

  // Text hierarchy
  primary: chalk.hex("#F8FAFC"),
  secondary: chalk.hex("#94A3B8"),
  muted: chalk.hex("#64748B"),
  subtle: chalk.hex("#475569"),

  // Accents
  accent: chalk.hex("#A78BFA"),
  link: chalk.hex("#22D3EE"),
  gold: chalk.hex("#FBBF24"),

  // Borders
  border: chalk.hex("#334155"),
};
