import { Command } from "commander";
import * as ui from "../lib/ui.js";

const BASH_COMPLETION = `# anonli bash completion
# Add to ~/.bashrc: source <(anonli completions bash)
_anonli_completions() {
  local cur prev words cword
  _init_completion 2>/dev/null || {
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
  }

  local commands="login logout whoami drop alias recipient domain apikey config update subscribe completions"
  local drop_cmds="upload list info download delete toggle share"
  local alias_cmds="new list delete toggle update stats"
  local recipient_cmds="list add delete default verify pgp"
  local domain_cmds="list add verify info delete dkim"
  local apikey_cmds="list create delete"
  local config_cmds="get set validate"

  case "\${COMP_WORDS[1]}" in
    drop)
      COMPREPLY=($(compgen -W "\${drop_cmds}" -- "\${cur}"))
      ;;
    alias)
      COMPREPLY=($(compgen -W "\${alias_cmds}" -- "\${cur}"))
      ;;
    recipient|recipients)
      COMPREPLY=($(compgen -W "\${recipient_cmds}" -- "\${cur}"))
      ;;
    domain|domains)
      COMPREPLY=($(compgen -W "\${domain_cmds}" -- "\${cur}"))
      ;;
    apikey|api-key)
      COMPREPLY=($(compgen -W "\${apikey_cmds}" -- "\${cur}"))
      ;;
    config)
      COMPREPLY=($(compgen -W "\${config_cmds}" -- "\${cur}"))
      ;;
    *)
      COMPREPLY=($(compgen -W "\${commands}" -- "\${cur}"))
      ;;
  esac
}
complete -F _anonli_completions anonli
`;

const ZSH_COMPLETION = `# anonli zsh completion
# Add to ~/.zshrc: source <(anonli completions zsh)
_anonli() {
  local state
  typeset -A opt_args

  _arguments \\
    '1: :->command' \\
    '*: :->args'

  case \$state in
    command)
      local commands=(
        'login:Authenticate with your API key'
        'logout:Remove stored credentials'
        'whoami:Show current user info'
        'drop:Encrypted file drops'
        'alias:Manage email aliases'
        'recipient:Manage email recipients'
        'domain:Manage custom domains'
        'apikey:Manage API keys'
        'config:View or update CLI configuration'
        'update:Update anonli to latest version'
        'subscribe:Subscribe to a paid plan'
        'completions:Generate shell completion script'
      )
      _describe 'command' commands
      ;;
    args)
      case \$words[2] in
        drop)
          local drop_cmds=(
            'upload:Create an encrypted drop'
            'list:List your drops'
            'info:View drop details'
            'download:Download and decrypt a drop'
            'delete:Delete a drop'
            'toggle:Toggle enabled/disabled state'
            'share:Reconstruct a share URL'
          )
          _describe 'drop command' drop_cmds
          ;;
        alias)
          local alias_cmds=(
            'new:Create a new alias'
            'list:List all aliases'
            'delete:Delete an alias'
            'toggle:Toggle alias active state'
            'update:Update alias settings'
            'stats:Show forwarding statistics'
          )
          _describe 'alias command' alias_cmds
          ;;
        config)
          local config_cmds=('get:Show config' 'set:Update config value' 'validate:Check config health')
          _describe 'config command' config_cmds
          ;;
      esac
      ;;
  esac
}
compdef _anonli anonli
`;

const FISH_COMPLETION = `# anonli fish completion
# Add to ~/.config/fish/completions/anonli.fish or run: anonli completions fish | source

# Disable file completions by default
complete -c anonli -f

# Main commands
complete -c anonli -n '__fish_use_subcommand' -a login -d 'Authenticate with your API key'
complete -c anonli -n '__fish_use_subcommand' -a logout -d 'Remove stored credentials'
complete -c anonli -n '__fish_use_subcommand' -a whoami -d 'Show current user info'
complete -c anonli -n '__fish_use_subcommand' -a drop -d 'Encrypted file drops'
complete -c anonli -n '__fish_use_subcommand' -a alias -d 'Manage email aliases'
complete -c anonli -n '__fish_use_subcommand' -a recipient -d 'Manage email recipients'
complete -c anonli -n '__fish_use_subcommand' -a domain -d 'Manage custom domains'
complete -c anonli -n '__fish_use_subcommand' -a apikey -d 'Manage API keys'
complete -c anonli -n '__fish_use_subcommand' -a config -d 'View or update CLI configuration'
complete -c anonli -n '__fish_use_subcommand' -a update -d 'Update anonli to latest version'
complete -c anonli -n '__fish_use_subcommand' -a subscribe -d 'Subscribe to a paid plan'
complete -c anonli -n '__fish_use_subcommand' -a completions -d 'Generate shell completion script'

# Quiet flag
complete -c anonli -s q -l quiet -d 'Suppress non-essential output'

# drop subcommands
complete -c anonli -n '__fish_seen_subcommand_from drop' -a upload -d 'Create an encrypted drop'
complete -c anonli -n '__fish_seen_subcommand_from drop' -a list -d 'List your drops'
complete -c anonli -n '__fish_seen_subcommand_from drop' -a info -d 'View drop details'
complete -c anonli -n '__fish_seen_subcommand_from drop' -a download -d 'Download and decrypt a drop'
complete -c anonli -n '__fish_seen_subcommand_from drop' -a delete -d 'Delete a drop'
complete -c anonli -n '__fish_seen_subcommand_from drop' -a toggle -d 'Toggle enabled/disabled state'
complete -c anonli -n '__fish_seen_subcommand_from drop' -a share -d 'Reconstruct a share URL'

# alias subcommands
complete -c anonli -n '__fish_seen_subcommand_from alias' -a new -d 'Create a new alias'
complete -c anonli -n '__fish_seen_subcommand_from alias' -a list -d 'List all aliases'
complete -c anonli -n '__fish_seen_subcommand_from alias' -a delete -d 'Delete an alias'
complete -c anonli -n '__fish_seen_subcommand_from alias' -a toggle -d 'Toggle alias active state'
complete -c anonli -n '__fish_seen_subcommand_from alias' -a update -d 'Update alias settings'
complete -c anonli -n '__fish_seen_subcommand_from alias' -a stats -d 'Show forwarding statistics'

# config subcommands
complete -c anonli -n '__fish_seen_subcommand_from config' -a get -d 'Show current config'
complete -c anonli -n '__fish_seen_subcommand_from config' -a set -d 'Update a config value'
complete -c anonli -n '__fish_seen_subcommand_from config' -a validate -d 'Check config health'

# completions shells
complete -c anonli -n '__fish_seen_subcommand_from completions' -a bash -d 'Bash completion script'
complete -c anonli -n '__fish_seen_subcommand_from completions' -a zsh -d 'Zsh completion script'
complete -c anonli -n '__fish_seen_subcommand_from completions' -a fish -d 'Fish completion script'
`;

export const completionsCommand = new Command("completions")
  .description("Generate shell completion script")
  .argument("<shell>", "Shell type: bash, zsh, or fish")
  .addHelpText("after", `
Examples:
  # bash — add to ~/.bashrc
  source <(anonli completions bash)

  # zsh — add to ~/.zshrc
  source <(anonli completions zsh)

  # fish — save to completions directory
  anonli completions fish > ~/.config/fish/completions/anonli.fish`)
  .action((shell: string) => {
    switch (shell.toLowerCase()) {
      case "bash":
        process.stdout.write(BASH_COMPLETION);
        break;
      case "zsh":
        process.stdout.write(ZSH_COMPLETION);
        break;
      case "fish":
        process.stdout.write(FISH_COMPLETION);
        break;
      default:
        ui.error(`Unknown shell: ${shell}. Supported shells: bash, zsh, fish`);
        process.exit(1);
    }
  });
