import type { Command, Help } from "commander";
import { brandColor, c } from "./theme.js";
import { getApiKey, getUserInfo } from "./config.js";

const LOGO = `
   __ _ _ __   ___  _ __   | (_)
  / _\` | '_ \\ / _ \\| '_ \\  | | |
 | (_| | | | | (_) | | | |_| | |
  \\__,_|_| |_|\\___/|_| |_(_)_|_|`;

export function printBanner(version: string): string {
  const logo = brandColor.multiline(LOGO.slice(1)); // trim leading newline
  const tagline = c.secondary(" Encrypted drops & anonymous aliases") + c.muted(` v${version}`);

  let greeting = "";
  if (getApiKey()) {
    const info = getUserInfo();
    if (info) {
      const displayName = info.name
        ? info.name.split(" ")[0]
        : info.email.split("@")[0];
      greeting = "\n " + c.secondary("Welcome back, ") + c.primary(displayName) + c.secondary("!");
    }
  }

  return `\n${logo}\n${tagline}${greeting}\n`;
}

export function printHeader(commandName: string): string {
  const name = brandColor("anon.li");
  const arrow = c.muted(" > ");
  const cmd = c.primary(commandName);
  const divider = c.subtle("─".repeat(48));
  return `${name}${arrow}${cmd}\n${divider}`;
}

function getCommandPath(cmd: Command): string {
  const parts: string[] = [];
  let current: Command | null = cmd;
  while (current) {
    if (current.parent) {
      parts.unshift(current.name());
    }
    current = current.parent;
  }
  return parts.join(" ");
}

export function createHelpConfig(version: string): Partial<Help> {
  return {
    formatHelp(cmd: Command, helper: Help): string {
      const isRoot = !cmd.parent;
      let output = "";

      // Header
      if (isRoot) {
        output += printBanner(version) + "\n";
      } else {
        output += printHeader(getCommandPath(cmd)) + "\n\n";
      }

      // Description
      const desc = helper.commandDescription(cmd);
      if (desc && !isRoot) {
        output += `  ${c.secondary(desc)}\n\n`;
      }

      // Usage
      const usage = helper.commandUsage(cmd);
      output += `  ${c.muted("Usage")}\n`;
      output += `    ${c.subtle("$")} ${c.primary(usage)}\n`;

      // Arguments
      const args = helper.visibleArguments(cmd);
      if (args.length > 0) {
        const termLen = helper.longestArgumentTermLength(cmd, helper);
        output += `\n  ${c.muted("Arguments")}\n`;
        for (const arg of args) {
          const term = helper.argumentTerm(arg);
          const desc = helper.argumentDescription(arg);
          output += `    ${c.accent(term.padEnd(termLen + 2))}  ${c.secondary(desc)}\n`;
        }
      }

      // Commands (filter out implicit 'help' subcommand)
      const cmds = helper.visibleCommands(cmd).filter(
        (sub: Command) => sub.name() !== "help"
      );
      if (cmds.length > 0) {
        let maxLen = 0;
        const items = cmds.map((sub: Command) => {
          const term = helper.subcommandTerm(sub);
          if (term.length > maxLen) maxLen = term.length;
          return { term, desc: helper.subcommandDescription(sub) };
        });
        output += `\n  ${c.muted("Commands")}\n`;
        for (const { term, desc } of items) {
          output += `    ${c.accent(term.padEnd(maxLen + 2))}  ${c.secondary(desc)}\n`;
        }
      }

      // Options
      const opts = helper.visibleOptions(cmd);
      if (opts.length > 0) {
        const termLen = helper.longestOptionTermLength(cmd, helper);
        output += `\n  ${c.muted("Options")}\n`;
        for (const opt of opts) {
          const term = helper.optionTerm(opt);
          const desc = helper.optionDescription(opt);
          output += `    ${c.accent(term.padEnd(termLen + 2))}  ${c.secondary(desc)}\n`;
        }
      }

      output += "\n";
      return output;
    },
  } as Partial<Help>;
}
