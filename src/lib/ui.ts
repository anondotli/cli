import chalk from "chalk";
import ora, { type Ora } from "ora";
import cliProgress from "cli-progress";
import figures from "figures";
import boxen from "boxen";
import Table from "cli-table3";
import terminalLink from "terminal-link";
import readline from "node:readline";
import { c } from "./theme.js";
import { printHeader } from "./brand.js";
import type { RateLimitInfo } from "../types/api.js";

// Re-export theme for direct access from commands
export { c } from "./theme.js";

// ─── Quiet Mode (U2) ──────────────────────────────────────

let _quiet = false;
const UNLIMITED_SYMBOL = "∞";

export function setQuiet(val: boolean): void {
  _quiet = val;
}

// ─── JSON Output (U1) ─────────────────────────────────────

export function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

// ─── Spinner ──────────────────────────────────────────────

export function spinner(text: string): Ora {
  return ora({
    text: c.secondary(text),
    color: "magenta",
    isSilent: _quiet,
  }).start();
}

// ─── Status Messages ──────────────────────────────────────

export function success(message: string): void {
  if (_quiet) return;
  console.log(c.success(figures.tick) + " " + c.primary(message));
}

export function error(message: string): void {
  // Errors always go to stderr, even in quiet mode
  console.error(c.error(figures.cross) + " " + c.primary(message));
}

export function warn(message: string): void {
  if (_quiet) return;
  console.log(c.warning(figures.warning) + " " + c.secondary(message));
}

export function info(message: string): void {
  if (_quiet) return;
  console.log(c.info(figures.info) + " " + c.secondary(message));
}

// ─── Text Formatting ──────────────────────────────────────

export function dim(text: string): string {
  return c.muted(text);
}

export function bold(text: string): string {
  return c.primary(chalk.bold(text));
}

export function link(url: string): string {
  return terminalLink(c.link(url), url, {
    fallback: () => c.link(url),
  });
}

// ─── Layout ───────────────────────────────────────────────

export function header(title: string): void {
  if (_quiet) return;
  console.log(printHeader(title));
}

export function spacer(): void {
  if (_quiet) return;
  console.log();
}

export function keyValue(label: string, value: string, indent = 2): void {
  if (_quiet) return;
  const pad = " ".repeat(indent);
  console.log(`${pad}${c.secondary(label + ":")}  ${c.primary(value)}`);
}

export function sectionTitle(title: string): void {
  if (_quiet) return;
  console.log(c.secondary(chalk.bold(title)));
}

// ─── Boxes ────────────────────────────────────────────────

export function successBox(title: string, content: string): void {
  if (_quiet) return;
  console.log(
    boxen(content, {
      title: c.success(figures.tick + " " + title),
      titleAlignment: "left",
      borderStyle: "round",
      borderColor: "#10B981",
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
    })
  );
}

export function errorBox(
  title: string,
  message: string,
  suggestion?: string
): void {
  let content = c.primary(message);
  if (suggestion) {
    content += "\n" + c.muted(suggestion);
  }
  // Error boxes always show (not suppressed by quiet)
  console.log(
    boxen(content, {
      title: c.error(figures.cross + " " + title),
      titleAlignment: "left",
      borderStyle: "round",
      borderColor: "#EF4444",
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
    })
  );
}

export function box(
  content: string,
  opts?: { title?: string; borderColor?: string }
): void {
  if (_quiet) return;
  console.log(
    boxen(content, {
      title: opts?.title,
      titleAlignment: "left",
      borderStyle: "round",
      borderColor: (opts?.borderColor || "#334155") as string,
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
    })
  );
}

// ─── Prompts ──────────────────────────────────────────────

export function confirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const styled = `${c.warning(figures.warning)} ${c.primary(prompt)} ${c.muted("[y/N]")} `;
    rl.question(styled, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

export function prompt(
  question: string,
  opts?: { mask?: boolean }
): Promise<string> {
  const styled = `${c.info(figures.pointer)} ${c.primary(question)} `;

  if (!opts?.mask) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(styled, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  // Masked input: use raw mode for correct star echo + backspace handling
  return new Promise((resolve) => {
    process.stdout.write(styled);
    const stdin = process.stdin;

    if (!stdin.isTTY) {
      // Non-TTY fallback (piped input): read a line silently
      const rl = readline.createInterface({ input: stdin });
      rl.once("line", (line) => {
        rl.close();
        console.log();
        resolve(line.trim());
      });
      return;
    }

    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let input = "";
    const onData = (data: string) => {
      for (const ch of data) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(wasRaw);
          stdin.removeListener("data", onData);
          stdin.pause();
          console.log();
          resolve(input.trim());
          return;
        } else if (ch === "\u0003") {
          // Ctrl+C
          stdin.setRawMode(wasRaw);
          stdin.removeListener("data", onData);
          stdin.pause();
          console.log();
          process.exit(0);
          return;
        } else if (ch === "\u007f" || ch === "\b") {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (ch.charCodeAt(0) >= 32) {
          input += ch;
          process.stdout.write(c.muted("*"));
        }
      }
    };

    stdin.on("data", onData);
  });
}

// ─── Usage Bars ──────────────────────────────────────────

function isUnlimitedLimit(limit: number): boolean {
  return !Number.isFinite(limit) || limit < 0;
}

function usageBar(used: number, limit: number, width = 12): string {
  if (isUnlimitedLimit(limit)) {
    return c.success("░".repeat(width));
  }
  if (limit === 0) {
    return used > 0 ? c.error("▓".repeat(width)) : c.subtle("░".repeat(width));
  }
  const ratio = Math.min(used / limit, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  let colorFn = c.success;
  if (used > limit) colorFn = c.error;
  else if (ratio >= 0.9) colorFn = c.warning;
  else if (ratio >= 0.7) colorFn = c.warning;

  return colorFn("▓".repeat(filled)) + c.subtle("░".repeat(empty));
}

export function usageRow(
  label: string,
  used: number,
  limit?: number,
  opts?: { labelWidth?: number; barWidth?: number }
): void {
  if (_quiet) return;
  const labelWidth = opts?.labelWidth ?? 14;
  const barWidth = opts?.barWidth ?? 12;
  const pad = "  ";
  const paddedLabel = c.secondary((label + ":").padEnd(labelWidth));

  if (limit === undefined) {
    console.log(`${pad}${paddedLabel} ${c.primary(String(used))}`);
    return;
  }

  const bar = usageBar(used, limit, barWidth);
  const unlimited = isUnlimitedLimit(limit);
  const count = unlimited ? `${used}/${UNLIMITED_SYMBOL}` : `${used}/${limit}`;
  const overLimit = !unlimited && used > limit;
  const countStr = overLimit ? c.error(count) : c.primary(count);
  const warnStr = overLimit ? " " + c.warning("▲") : "";
  console.log(`${pad}${paddedLabel} ${bar}  ${countStr}${warnStr}`);
}

export function storageRow(
  label: string,
  used: number,
  limit: number,
  opts?: { labelWidth?: number; barWidth?: number }
): void {
  if (_quiet) return;
  const labelWidth = opts?.labelWidth ?? 14;
  const barWidth = opts?.barWidth ?? 12;
  const pad = "  ";
  const paddedLabel = c.secondary((label + ":").padEnd(labelWidth));
  const bar = usageBar(used, limit, barWidth);
  const limitLabel = isUnlimitedLimit(limit) ? UNLIMITED_SYMBOL : formatBytes(limit);
  console.log(
    `${pad}${paddedLabel} ${bar}  ${c.primary(formatBytes(used))}${c.muted("/")}${c.primary(limitLabel)}`
  );
}

// ─── Badges ───────────────────────────────────────────────

export function statusBadge(
  label: string,
  variant: "active" | "inactive"
): string {
  if (variant === "active") {
    return c.success("●") + " " + c.success(label);
  }
  return c.error("○") + " " + c.error(label);
}

export function tierBadge(tier: string, product?: string | null): string {
  const t = tier.toLowerCase();
  const productLabel = product ? ` (${product.charAt(0).toUpperCase() + product.slice(1)})` : "";
  if (t === "pro") return c.gold(chalk.bold("PRO")) + c.muted(productLabel);
  if (t === "plus") return c.accent(chalk.bold("PLUS")) + c.muted(productLabel);
  return c.muted("Free");
}

// ─── Progress Bar ─────────────────────────────────────────

export function progressBar(
  total: number,
  label: string
): cliProgress.SingleBar {
  const bar = new cliProgress.SingleBar(
    {
      format: `  ${c.secondary(label)} ${chalk.hex("#8B5CF6")("{bar}")} ${c.primary("{percentage}%")} ${c.subtle("┃")} ${c.muted("{value}/{total}")}`,
      barCompleteChar: "━",
      barIncompleteChar: chalk.hex("#334155")("━"),
      hideCursor: true,
      noTTYOutput: _quiet,
    },
    cliProgress.Presets.shades_classic
  );
  bar.start(total, 0);
  return bar;
}

// ─── Rate Limit ───────────────────────────────────────────

export function showRateLimit(rateLimit?: RateLimitInfo): void {
  if (!rateLimit || _quiet) return;
  console.log(
    c.subtle(
      `  ${figures.bullet} API: ${rateLimit.remaining}/${rateLimit.limit} requests remaining`
    )
  );
}

// ─── Table ────────────────────────────────────────────────

export function table(headers: string[], rows: string[][]): void {
  if (_quiet) return;
  const t = new Table({
    head: headers.map((h) => c.secondary(chalk.bold(h))),
    chars: {
      top: c.subtle("─"),
      "top-mid": c.subtle("┬"),
      "top-left": c.subtle("╭"),
      "top-right": c.subtle("╮"),
      bottom: c.subtle("─"),
      "bottom-mid": c.subtle("┴"),
      "bottom-left": c.subtle("╰"),
      "bottom-right": c.subtle("╯"),
      left: c.subtle("│"),
      "left-mid": c.subtle("├"),
      mid: c.subtle("─"),
      "mid-mid": c.subtle("┼"),
      right: c.subtle("│"),
      "right-mid": c.subtle("┤"),
      middle: c.subtle("│"),
    },
    style: {
      head: [],
      border: [],
      "padding-left": 1,
      "padding-right": 1,
    },
  });

  for (const row of rows) {
    t.push(row);
  }

  console.log(t.toString());
}

// ─── Update Notice ────────────────────────────────────────

export function updateNotice(current: string, latest: string): void {
  if (_quiet) return;
  const content = [
    `${c.muted("Current:")} ${c.primary(current)}  ${c.muted("→")}  ${c.muted("Latest:")} ${c.success(latest)}`,
    "",
    `${c.secondary('Run')} ${c.accent("anonli update")} ${c.secondary('to upgrade')}`,
  ].join("\n");

  console.log(
    boxen(content, {
      title: c.warning(figures.warning + " Update Available"),
      titleAlignment: "left",
      borderStyle: "round",
      borderColor: "#F59E0B",
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
    })
  );
}

// ─── Formatters ───────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return UNLIMITED_SYMBOL;
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDays(days: number): string {
  if (days === 1) return "24 hours";
  return `${days} days`;
}

export function alignedKeyValue(label: string, value: string, labelWidth = 18, indent = 2): void {
  if (_quiet) return;
  const pad = " ".repeat(indent);
  const paddedLabel = (label + ":").padEnd(labelWidth);
  console.log(`${pad}${c.secondary(paddedLabel)} ${c.primary(value)}`);
}
