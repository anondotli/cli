# anon.li CLI

> **Encrypted file drops & anonymous email aliases.**

[![npm version](https://img.shields.io/npm/v/anonli?color=blue&style=flat-square)](https://www.npmjs.com/package/anonli)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square)](LICENSE)

The official CLI for [anon.li](https://anon.li). Share files with end-to-end encryption and manage anonymous email aliases directly from your terminal.

## Features

- **End-to-End Encryption**: Files are encrypted on your machine before upload. We never see your data.
- **Vault Recovery**: Drop owner keys and alias metadata can be encrypted with your account vault.
- **Anonymous File Drops**: Create expiring, password-protected file drops.
- **Email Aliases**: Generate and manage anonymous email aliases to protect your identity.
- **Custom Domains**: Use your own domains for email aliases.
- **Disposable & Permanent**: Choose between temporary or permanent aliases.

## Installation

### Automated Install (Linux & macOS, Windows)

The quickest way to get started is with our installer script:

```bash
curl -fsSL https://anon.li/cli/install.sh | bash
```
Or Windows:
```bash
irm https://anon.li/cli/install.ps1 | iex
```

### via Package Manager

If you have Node.js (18+) installed, you can install via npm, bun, or yarn:

```bash
# npm
npm install -g anonli

# bun
bun add -g anonli

# yarn
yarn global add anonli
```

## Getting Started

Once installed, authenticate with your anon.li account:

```bash
anonli login
```

This prompts for an API key from your dashboard. If you're on a headless server, you can set the `ANONLI_API_KEY` environment variable instead.

## Usage

### Encrypted File Drops

Share files securely. All encryption happens locally.

#### Upload a File or Directory

```bash
anonli drop upload ./secret-documents
```

**Options:**
- `-t, --title <text>`: Set a title for the drop.
- `-m, --message <text>`: Add an encrypted message.
- `-e, --expiry <days>`: Set expiration time (default: 1 day).
- `-n, --max-downloads <n>`: Limit the number of downloads.
- `-p, --password <pass>`: Password-protect the drop (requires specific plan).
- `--notify`: Get an email notification when files are downloaded.
- `--hide-branding`: Remove anon.li branding from the download page.
- `--no-vault`: Skip storing the owner key in your account vault.

Example:
```bash
anonli drop upload ./report.pdf --expiry 7 --password "hunter2" --notify
```

By default, uploads prompt for your vault password and store a vault-wrapped owner key so the dashboard can recover the share link. The vault password is never accepted as a command-line flag or environment variable and is not written to CLI config. Use `--no-vault` only when you intentionally want a link-only drop.

#### List Your Drops

View your active file drops:

```bash
anonli drop list
```

#### Download a Drop

Download files from a drop using its ID (and password/key if required):

```bash
anonli drop download <drop-id>
```

#### Delete a Drop

Permanently remove a drop:

```bash
anonli drop delete <drop-id>
```

---

### Email Aliases

Protect your real email address with aliases.

#### Create a New Alias

Generate a random alias:

```bash
anonli alias new
# Output: Created alias: h73hz3e@anon.li
```

Create a custom alias (if supported by your plan):

```bash
anonli alias new --custom my-alias --domain anon.li
```

**Options:**
- `--label <text>`: Add a vault-encrypted label to remember what this alias is for.
- `--note <text>`: Add a vault-encrypted private note.
- `--recipient <id>`: Forward emails to a specific recipient ID.

#### List Aliases

See all your aliases:

```bash
anonli alias list
```

#### Toggle an Alias

Enable or disable an alias:

```bash
anonli alias toggle <alias-email>
```

---

### Other Commands

- **`anonli whoami`**: Check current login status.
- **`anonli domain list`**: Manage custom domains.
- **`anonli config`**: View current CLI configuration.
- **`anonli update`**: Update the CLI to the latest version.

## Configuration

The CLI stores configuration in `~/.config/anonli.json` (or `$XDG_CONFIG_HOME/anonli.json`).

You can override the API key globally by setting the `ANONLI_API_KEY` environment variable.

## License

This project is licensed under the AGPL-3.0 License.
