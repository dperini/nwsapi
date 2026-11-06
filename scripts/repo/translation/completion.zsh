# Source this file from the repository root to complete document names for
# `pnpm run docs:translate <name>` in the current zsh session.
if (( ! $+functions[compdef] )); then
  autoload -Uz compinit
  compinit -i -d /dev/null
fi
if (( ! $+functions[_pnpm] )); then
  autoload -Uz _pnpm
fi

_nwsapi_pnpm() {
  if [[ $words[2] == run && $CURRENT -ge 4 ]]; then
    local -a suggestions
    if [[ $words[3] == docs:translate ]]; then
      suggestions=("${(@f)$(pnpm --silent run docs:translate 2>/dev/null)}")
      compadd -- "${suggestions[@]}"
      return
    fi
    if [[ $words[3] == bench:tak ]]; then
      suggestions=(run record push history)
      compadd -- "${suggestions[@]}"
      return
    fi
  fi
  _pnpm "$@"
}

compdef _nwsapi_pnpm pnpm
