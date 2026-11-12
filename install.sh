#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/amyrindequi-design/fedora-gnome-larper-rice"
TARBALL_URL="${REPO_URL}/archive/refs/heads/main.tar.gz"
TMP_REPO=""

cleanup() {
    if [ -n "$TMP_REPO" ] && [ -d "$TMP_REPO" ]; then
        rm -rf "$TMP_REPO"
    fi
}
trap cleanup EXIT

resolve_repo_dir() {
    local src="${BASH_SOURCE[0]:-}"
    if [ -n "$src" ] && [ -e "$src" ]; then
        local candidate
        candidate="$(cd "$(dirname "$src")" 2>/dev/null && pwd || true)"
        if [ -f "$candidate/configs/fastfetch/config.jsonc" ] && [ -d "$candidate/gnome/extensions" ]; then
            echo "$candidate"
            return 0
        fi
    fi

    if [ -f "$PWD/configs/fastfetch/config.jsonc" ] && [ -d "$PWD/gnome/extensions" ]; then
        echo "$PWD"
        return 0
    fi

    TMP_REPO="$(mktemp -d)"
    echo "[0/7] Baixando repositório fedora-gnome-larper-rice..." >&2
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$TARBALL_URL" | tar -xz --strip-components=1 -C "$TMP_REPO"
    elif command -v git >/dev/null 2>&1; then
        git clone --depth 1 "$REPO_URL.git" "$TMP_REPO" >/dev/null
    else
        echo "Erro: é necessário 'curl' ou 'git' para baixar os arquivos." >&2
        exit 1
    fi
    echo "$TMP_REPO"
}

run_pkg_install() {
    local pkgs=("$@")
    [ "${#pkgs[@]}" -eq 0 ] && return 0

    local use_sudo=""
    if [ "$(id -u)" -ne 0 ]; then
        if ! command -v sudo >/dev/null 2>&1 || [ ! -r /dev/tty ]; then
            echo "Aviso: sem acesso interativo a sudo; instale manualmente: ${pkgs[*]}"
            return 0
        fi
        use_sudo="sudo"
    fi

    if command -v dnf >/dev/null 2>&1; then
        $use_sudo dnf install -y "${pkgs[@]}" </dev/tty
    elif command -v apt-get >/dev/null 2>&1; then
        $use_sudo apt-get update </dev/tty && $use_sudo apt-get install -y "${pkgs[@]}" </dev/tty
    elif command -v pacman >/dev/null 2>&1; then
        $use_sudo pacman -S --needed --noconfirm "${pkgs[@]}" </dev/tty
    else
        echo "Aviso: gerenciador de pacotes não reconhecido; garanta que existem: ${pkgs[*]}"
    fi
}

install_system_deps() {
    echo "[1/7] Verificando dependências do sistema (tmux, curl, unzip, xz, glib2, python3)..."
    local missing=()
    local pairs=(
        "tmux:tmux"
        "curl:curl"
        "unzip:unzip"
        "tar:tar"
        "xz:xz"
        "python3:python3"
        "dconf:dconf"
    )
    for pair in "${pairs[@]}"; do
        local bin="${pair%%:*}"
        local pkg="${pair##*:}"
        if ! command -v "$bin" >/dev/null 2>&1; then
            missing+=("$pkg")
        fi
    done

    if ! command -v glib-compile-schemas >/dev/null 2>&1; then
        if command -v dnf >/dev/null 2>&1 || command -v pacman >/dev/null 2>&1; then
            missing+=("glib2")
        else
            missing+=("libglib2.0-bin")
        fi
    fi

    if [ "${#missing[@]}" -gt 0 ]; then
        run_pkg_install "${missing[@]}"
    fi
}

install_cli_tools() {
    echo "[2/7] Instalando binários CLI em ~/.local/bin (fastfetch, starship, btop, yazi)..."
    export PATH="$HOME/.local/bin:$PATH"
    local arch
    arch="$(uname -m)"

    if [ "$arch" = "x86_64" ]; then
        if ! command -v starship >/dev/null 2>&1; then
            curl -fsSL "https://github.com/starship/starship/releases/latest/download/starship-x86_64-unknown-linux-gnu.tar.gz" \
                | tar -xz -C "$HOME/.local/bin/" starship || true
            chmod +x "$HOME/.local/bin/starship" 2>/dev/null || true
        fi

        if ! command -v btop >/dev/null 2>&1; then
            local tmp_btop
            tmp_btop="$(mktemp -d)"
            if curl -fsSL "https://github.com/aristocratos/btop/releases/download/v1.4.8/btop-x86_64-unknown-linux-musl.tar.gz" \
                | tar -xz -C "$tmp_btop" 2>/dev/null; then
                cp -f "$tmp_btop/btop/bin/btop" "$HOME/.local/bin/btop"
                chmod +x "$HOME/.local/bin/btop"
            fi
            rm -rf "$tmp_btop"
        fi

        if ! command -v yazi >/dev/null 2>&1; then
            local tmp_yazi
            tmp_yazi="$(mktemp -d)"
            if curl -fsSL "https://github.com/sxyazi/yazi/releases/latest/download/yazi-x86_64-unknown-linux-musl.zip" \
                -o "$tmp_yazi/yazi.zip" 2>/dev/null; then
                unzip -q -o "$tmp_yazi/yazi.zip" -d "$tmp_yazi"
                cp -f "$tmp_yazi"/yazi-x86_64-unknown-linux-musl/{yazi,ya} "$HOME/.local/bin/"
                chmod +x "$HOME/.local/bin/yazi" "$HOME/.local/bin/ya"
            fi
            rm -rf "$tmp_yazi"
        fi

        if ! command -v fastfetch >/dev/null 2>&1; then
            curl -fsSL "https://github.com/fastfetch-cli/fastfetch/releases/latest/download/fastfetch-linux-amd64.tar.gz" \
                | tar -xz --strip-components=3 -C "$HOME/.local/bin/" fastfetch-linux-amd64/usr/bin/fastfetch 2>/dev/null || true
            chmod +x "$HOME/.local/bin/fastfetch" 2>/dev/null || true
        fi
    fi

    # Fallback para pacotes da distro caso algum CLI ainda não esteja disponível (ex: aarch64)
    local extra_pkgs=()
    command -v fastfetch >/dev/null 2>&1 || extra_pkgs+=("fastfetch")
    command -v btop >/dev/null 2>&1 || extra_pkgs+=("btop")
    if [ "${#extra_pkgs[@]}" -gt 0 ]; then
        run_pkg_install "${extra_pkgs[@]}" || true
    fi
}

install_fonts() {
    echo "[3/7] Instalando JetBrainsMono Nerd Font..."
    if [ -z "$(ls -A "$HOME/.local/share/fonts/JetBrainsMonoNerd" 2>/dev/null)" ]; then
        curl -fsSL "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.tar.xz" \
            | tar -xJ -C "$HOME/.local/share/fonts/JetBrainsMonoNerd/"
        command -v fc-cache >/dev/null 2>&1 && fc-cache -f "$HOME/.local/share/fonts/JetBrainsMonoNerd/"
    fi
}

copy_configs() {
    echo "[4/7] Fazendo backup e aplicando scripts (larper, matrix, pipes) + configs..."
    local backup_dir="$HOME/.config/larper-backup-$(date +%Y%m%d-%H%M%S)"
    local backed_up=0
    for existing in \
        "$HOME/.bashrc" \
        "$HOME/.tmux.conf" \
        "$HOME/.config/starship.toml" \
        "$HOME/.config/fastfetch/config.jsonc" \
        "$HOME/.config/btop/btop.conf"
    do
        if [ -f "$existing" ]; then
            if [ "$backed_up" -eq 0 ]; then
                mkdir -p "$backup_dir"
                backed_up=1
            fi
            cp -f "$existing" "$backup_dir/"
        fi
    done

    for s in "$REPO_DIR/scripts/"*; do
        [ -f "$s" ] && cp -f "$s" "$HOME/.local/bin/"
    done
    chmod +x "$HOME/.local/bin/larper" "$HOME/.local/bin/matrix" "$HOME/.local/bin/pipes" "$HOME/.local/bin/gerar-skybox.py" 2>/dev/null || true

    cp -f "$REPO_DIR/configs/fastfetch/config.jsonc" "$HOME/.config/fastfetch/config.jsonc"
    cp -f "$REPO_DIR/configs/fastfetch/logo.txt" "$HOME/.config/fastfetch/logo.txt"
    cp -f "$REPO_DIR/configs/starship.toml" "$HOME/.config/starship.toml"
    cp -f "$REPO_DIR/configs/btop/btop.conf" "$HOME/.config/btop/btop.conf"
    cp -f "$REPO_DIR/configs/.tmux.conf" "$HOME/.tmux.conf"
    cp -f "$REPO_DIR/configs/.bashrc" "$HOME/.bashrc"
    cp -f "$REPO_DIR/configs/burn-my-windows/profiles/chrollo-larper.conf" "$HOME/.config/burn-my-windows/profiles/1700000000.conf"
}

apply_wallpapers() {
    local pictures_root=""
    if command -v xdg-user-dir >/dev/null 2>&1; then
        pictures_root="$(xdg-user-dir PICTURES 2>/dev/null || true)"
    fi
    if [ -z "$pictures_root" ] || [ "$pictures_root" = "$HOME" ]; then
        if [ -d "$HOME/Imagens" ]; then
            pictures_root="$HOME/Imagens"
        else
            pictures_root="$HOME/Pictures"
        fi
    fi

    WALLPAPER_DIR="${pictures_root}/Wallpapers-Linux"
    mkdir -p "$WALLPAPER_DIR"

    echo "[5/7] Copiando Wallpapers + Skybox 360° para ${WALLPAPER_DIR}..."
    for w in "$REPO_DIR/wallpapers/"*; do
        [ -f "$w" ] && cp -f "$w" "$WALLPAPER_DIR/"
    done
    cp -f "$REPO_DIR/wallpapers/chrollo-hunter-x-hunter.jpg" "$HOME/.config/background"
    gsettings set org.gnome.desktop.background picture-uri "file://${WALLPAPER_DIR}/chrollo-hunter-x-hunter.jpg"
    gsettings set org.gnome.desktop.background picture-uri-dark "file://${WALLPAPER_DIR}/chrollo-hunter-x-hunter.jpg"
}

apply_gnome_settings() {
    echo "[6/7] Aplicando tema escuro, botões de janela, Ptyxis, Blur, Cubo 3D e Burn My Windows..."
    gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark' || true
    gsettings set org.gnome.desktop.interface accent-color 'yellow' || true
    gsettings set org.gnome.desktop.interface clock-show-date true
    gsettings set org.gnome.desktop.interface clock-show-weekday true
    gsettings set org.gnome.desktop.interface show-battery-percentage true
    gsettings set org.gnome.desktop.interface monospace-font-name 'JetBrains Mono 10'

    gsettings set org.gnome.desktop.wm.preferences button-layout 'appmenu:minimize,maximize,close'
    gsettings set org.gnome.desktop.wm.preferences num-workspaces 4

    gsettings set org.gnome.mutter dynamic-workspaces false
    gsettings set org.gnome.mutter center-new-windows true
    gsettings set org.gnome.mutter edge-tiling false

    dconf load /org/gnome/shell/extensions/blur-my-shell/ < "$REPO_DIR/gnome/blur-my-shell.dconf"
    sed "s|/home/amyr/Imagens/Wallpapers-Linux|${WALLPAPER_DIR}|g" "$REPO_DIR/gnome/desktop-cube.dconf" \
        | dconf load /org/gnome/shell/extensions/desktop-cube/
    dconf write /org/gnome/shell/extensions/desktop-cube/background-panorama "'${WALLPAPER_DIR}/cube-skybox-geneiryodan.png'"

    if [ -s "$REPO_DIR/gnome/compiz-windows-effect.dconf" ]; then
        dconf load /org/gnome/shell/extensions/com/github/hermes83/compiz-windows-effect/ < "$REPO_DIR/gnome/compiz-windows-effect.dconf"
    fi
    dconf load /org/gnome/shell/extensions/dash-to-dock/ < "$REPO_DIR/gnome/dash-to-dock.dconf"
    dconf load /org/gnome/shell/extensions/o-tiling/ < "$REPO_DIR/gnome/o-tiling.dconf"
    if [ -s "$REPO_DIR/gnome/caffeine.dconf" ]; then
        dconf load /org/gnome/shell/extensions/caffeine/ < "$REPO_DIR/gnome/caffeine.dconf"
    fi
    if [ -s "$REPO_DIR/gnome/clipboard-indicator.dconf" ]; then
        dconf load /org/gnome/shell/extensions/clipboard-indicator/ < "$REPO_DIR/gnome/clipboard-indicator.dconf"
    fi

    dconf load /org/gnome/Ptyxis/ < "$REPO_DIR/gnome/ptyxis.dconf" || true
    python3 - <<'PY' || true
import ast, subprocess
try:
    cur = subprocess.check_output(['gsettings', 'get', 'org.gnome.Ptyxis', 'profile-uuids'], text=True).strip()
    uuids = ast.literal_eval(cur) if cur.startswith('[') else []
    for u in uuids:
        subprocess.run(['dconf', 'write', f'/org/gnome/Ptyxis/Profiles/{u}/opacity', '0.84'], check=False)
except Exception:
    pass
PY

    dconf write /org/gnome/shell/extensions/burn-my-windows/active-profile "'$HOME/.config/burn-my-windows/profiles/1700000000.conf'"
}

install_extensions() {
    echo "[7/7] Instalando extensões GNOME Shell + extensão local Hacker Workspace Transition..."
    local shell_ver="51"
    if command -v gnome-shell >/dev/null 2>&1; then
        shell_ver="$(gnome-shell --version | awk '{print $3}' | cut -d. -f1)"
    fi

    local uuids=(
        "blur-my-shell@aunetx"
        "desktop-cube@schneegans.github.com"
        "burn-my-windows@schneegans.github.com"
        "compiz-windows-effect@hermes83.github.com"
        "dash-to-dock@micxgx.gmail.com"
        "transparent-top-bar@ftpix.com"
        "o-tiling@oliwebd.github.com"
        "Vitals@CoreCoding.com"
        "caffeine@patapon.info"
        "clipboard-indicator@tudmotu.com"
        "appindicatorsupport@rgcjonas.gmail.com"
    )

    for UUID in "${uuids[@]}"; do
        local pk
        pk="$(curl -fsSL "https://extensions.gnome.org/extension-info/?uuid=${UUID}" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin).get('shell_version_map', {})
ver = '$shell_ver'
if ver not in d and d:
    ver = sorted(d.keys(), key=lambda x: [int(p) if p.isdigit() else 0 for p in x.split('.')])[-1]
print(d.get(ver, {}).get('pk', ''))
" 2>/dev/null || true)"
        if [ -n "$pk" ]; then
            local zip_path="/tmp/${UUID}.zip"
            if curl -fsSL "https://extensions.gnome.org/download-extension/${UUID}.shell-extension.zip?version_tag=${pk}" -o "$zip_path"; then
                if ! gnome-extensions install --force "$zip_path" 2>/dev/null; then
                    local ext_dir="$HOME/.local/share/gnome-shell/extensions/$UUID"
                    mkdir -p "$ext_dir"
                    unzip -qo "$zip_path" -d "$ext_dir"
                    if [ -d "$ext_dir/schemas" ] && command -v glib-compile-schemas >/dev/null 2>&1; then
                        glib-compile-schemas "$ext_dir/schemas/"
                    fi
                fi
                gnome-extensions enable "$UUID" 2>/dev/null || true
                rm -f "$zip_path"
            fi
        fi
    done

    for local_uuid in hacker-transition@amyrindequi.github.io hacker-music@amyrindequi.github.io; do
        local ext_src="$REPO_DIR/gnome/extensions/$local_uuid"
        local ext_dst="$HOME/.local/share/gnome-shell/extensions/$local_uuid"
        if [[ -d "$ext_src" ]]; then
            mkdir -p "$ext_dst"
            cp -rf "$ext_src/"* "$ext_dst/"
            if [[ -d "$ext_dst/schemas" ]] && command -v glib-compile-schemas >/dev/null 2>&1; then
                glib-compile-schemas "$ext_dst/schemas/"
            fi
        fi
    done

    # Garante todas as extensões na chave enabled-extensions mesmo antes do próximo login
    python3 - <<'PY' || true
import ast, subprocess
desired = [
    'appindicatorsupport@rgcjonas.gmail.com',
    'transparent-top-bar@ftpix.com',
    'clipboard-indicator@tudmotu.com',
    'Vitals@CoreCoding.com',
    'caffeine@patapon.info',
    'o-tiling@oliwebd.github.com',
    'dash-to-dock@micxgx.gmail.com',
    'blur-my-shell@aunetx',
    'desktop-cube@schneegans.github.com',
    'burn-my-windows@schneegans.github.com',
    'compiz-windows-effect@hermes83.github.com',
    'hacker-transition@amyrindequi.github.io',
    'hacker-music@amyrindequi.github.io',
]
cur = subprocess.check_output(['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions'], text=True).strip()
exts = [] if cur == '@as []' else ast.literal_eval(cur)
for uuid in desired:
    if uuid not in exts:
        exts.append(uuid)
subprocess.check_call(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', str(exts)])
subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'disable-user-extensions', 'false'], check=False)
PY
}

main() {
    echo "╭────────────────────────────────────────────────────────────╮"
    echo "│   󰣛 GEN'EI RYODAN // NO.0 — Fedora GNOME Larper Installer  │"
    echo "╰────────────────────────────────────────────────────────────╯"

    REPO_DIR="$(resolve_repo_dir)"
    mkdir -p "$HOME/.local/bin" \
             "$HOME/.local/share/fonts/JetBrainsMonoNerd" \
             "$HOME/.config/fastfetch" \
             "$HOME/.config/btop" \
             "$HOME/.config/burn-my-windows/profiles"

    install_system_deps
    install_cli_tools
    install_fonts
    copy_configs
    apply_wallpapers
    apply_gnome_settings
    install_extensions

    echo ""
    echo "✔ OS Larper clonado com sucesso!"
    echo "  1) Abra um novo terminal para ver Fastfetch + Starship e digite 'larper' para o Skill Hunter Deck."
    echo "  2) Encerre a sessão e faça login novamente no GNOME para ativar todas as extensões (Cubo 3D + Skybox + Transição Hacker + Music HUD + Blur)."
}

main "$@"
