import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { dropCommand } from "./commands/drop.js";
import { aliasCommand } from "./commands/alias.js";
import { recipientCommand } from "./commands/recipient.js";
import { domainCommand } from "./commands/domain.js";
import { apikeyCommand } from "./commands/apikey.js";
import { configCommand } from "./commands/config-cmd.js";
import { updateCommand } from "./commands/update.js";
import { subscribeCommand } from "./commands/subscribe.js";
import { completionsCommand } from "./commands/completions.js";
import { checkForUpdates } from "./lib/version-check.js";
import { AuthError, CliError, PlanLimitError } from "./lib/errors.js";
import { createHelpConfig } from "./lib/brand.js";
import { CLI_VERSION } from "./lib/constants.js";
import { getApiKey } from "./lib/config.js";
import { runAuthFlow } from "./lib/auth.js";
import * as ui from "./lib/ui.js";

const VERSION = CLI_VERSION;

const helpConfig = createHelpConfig(VERSION);

const program = new Command()
  .name("anonli")
  .description("anon.li CLI - encrypted file drops & anonymous email aliases")
  .version(VERSION, "-v, --version")
  // U2: Global quiet flag
  .option("-q, --quiet", "Suppress all non-essential output (spinners, tables, boxes)")
  .configureHelp(helpConfig);

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(dropCommand);
program.addCommand(aliasCommand);
program.addCommand(recipientCommand);
program.addCommand(domainCommand);
program.addCommand(apikeyCommand);
program.addCommand(configCommand);
program.addCommand(updateCommand);
program.addCommand(subscribeCommand);
program.addCommand(completionsCommand);

// .addCommand() doesn't inherit settings - apply recursively
program.exitOverride();
function propagateSettings(cmd: Command) {
  for (const sub of cmd.commands) {
    sub.configureHelp(helpConfig);
    sub.exitOverride();
    propagateSettings(sub);
  }
}
propagateSettings(program);

// Commands that don't require authentication
const AUTH_EXEMPT = new Set([
  "login",
  "logout",
  "config",
  "update",
  "completions",
  "drop info",
  "drop get",
  "drop download",
  "drop dl",
  "drop share",
]);

// Auto-auth: prompt for API key when missing before authenticated commands
program.hook("preAction", async (thisCommand, actionCommand) => {
  // U2: Apply quiet mode from root program options
  const rootOpts = program.opts();
  if (rootOpts.quiet) {
    ui.setQuiet(true);
  }

  // Build the full command path (e.g. "drop upload", "alias list")
  const parts: string[] = [];
  let cmd: Command | null = actionCommand;
  while (cmd && cmd !== program) {
    parts.unshift(cmd.name());
    cmd = cmd.parent;
  }
  const commandPath = parts.join(" ");

  // Skip auth check for exempt commands
  if (AUTH_EXEMPT.has(commandPath)) return;

  // Already authenticated
  if (getApiKey()) return;

  // Non-TTY: throw with env var hint
  if (!process.stdin.isTTY) {
    throw new AuthError(
      "Not authenticated. Set ANONLI_API_KEY or run `anonli login` interactively."
    );
  }

  // TTY: run interactive auth flow
  ui.warn("Authentication required. Let's set up your API key.");
  ui.spacer();
  const success = await runAuthFlow();
  if (!success) {
    throw new AuthError("Authentication failed.");
  }
  ui.spacer();
});

// Version check after each command
program.hook("postAction", async () => {
  await checkForUpdates(VERSION).catch(() => {
    // Silently ignore
  });
});

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    // F7: Use typed exit codes from error classes
    if (err instanceof PlanLimitError) {
      ui.errorBox("Plan Limit", err.message, err.suggestion);
      process.exit(err.exitCode);
    }
    if (err instanceof AuthError) {
      ui.error(err.message);
      process.exit(err.exitCode);
    }
    if (err instanceof CliError) {
      // Message already printed by the command
      process.exit(err.exitCode);
    }
    // Commander exit override throws on help/version/missing subcommand
    const code = (err as Record<string, unknown>)?.code;
    if (typeof code === "string" && code.startsWith("commander.")) {
      process.exit(0);
    }
    // Unexpected error
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
