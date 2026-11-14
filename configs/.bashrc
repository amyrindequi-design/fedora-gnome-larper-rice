# .bashrc

# Source global definitions
if [ -f /etc/bashrc ]; then
    . /etc/bashrc
fi

# User specific environment
if ! [[ "$PATH" =~ "$HOME/.local/bin:$HOME/bin:" ]]; then
    PATH="$HOME/.local/bin:$HOME/bin:$PATH"
fi
export PATH

# User specific aliases and functions
if [ -d ~/.bashrc.d ]; then
    for rc in ~/.bashrc.d/*; do
        if [ -f "$rc" ]; then
            . "$rc"
        fi
    done
fi
unset rc

# Larper / Ricing Aliases
alias cat='bat --paging=never --style=plain'
alias fetch='clear && fastfetch'
alias top='btop'
alias htop='btop'
alias files='yazi'
alias matrix-chrollo='matrix --purple'

# Added by Antigravity CLI installer
export PATH="/home/amyr/.local/bin:$PATH"
if [[ $- == *i* ]]; then
    command -v fzf >/dev/null 2>&1 && eval "$(fzf --bash)"
    fcd() {
        local dir
        dir=$(find "${1:-$HOME}" -maxdepth 4 -type d -not -path '*/.*' 2>/dev/null | fzf --height 45% --reverse --border --prompt="cd ❯ ") || return
        cd "$dir" || return
    }
    fastfetch
    command -v starship >/dev/null 2>&1 && eval "$(starship init bash)"
fi
