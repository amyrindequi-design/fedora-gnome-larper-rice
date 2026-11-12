#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "╭────────────────────────────────────────────────────────────╮"
echo "│   󰣛 GEN'EI RYODAN // NO.0 — Fedora GNOME Larper Installer  │"
echo "╰────────────────────────────────────────────────────────────╯"

mkdir -p "$HOME/.local/bin" \
         "$HOME/.local/share/fonts/JetBrainsMonoNerd" \
         "$HOME/.config/fastfetch" \
         "$HOME/.config/btop" \
         "$HOME/.config/burn-my-windows/profiles" \
         "$HOME/Imagens/Wallpapers-Linux"

echo "[1/6] Instalando binários CLI em ~/.local/bin (fastfetch, starship, btop, yazi)..."
if ! command -v starship >/dev/null 2>&1; then
    curl -sL "https://github.com/starship/starship/releases/latest/download/starship-x86_64-unknown-linux-gnu.tar.gz" | tar -xz -C "$HOME/.local/bin/" starship
    chmod +x "$HOME/.local/bin/starship"
fi

if ! command -v btop >/dev/null 2>&1; then
    TMP_BTOP=$(mktemp -d)
    curl -sL "https://github.com/aristocratos/btop/releases/download/v1.4.8/btop-x86_64-unknown-linux-musl.tar.gz" | tar -xz -C "$TMP_BTOP"
    cp -f "$TMP_BTOP/btop/bin/btop" "$HOME/.local/bin/btop"
    chmod +x "$HOME/.local/bin/btop"
    rm -rf "$TMP_BTOP"
fi

if ! command -v yazi >/dev/null 2>&1; then
    TMP_YAZI=$(mktemp -d)
    curl -sL "https://github.com/sxyazi/yazi/releases/latest/download/yazi-x86_64-unknown-linux-musl.zip" -o "$TMP_YAZI/yazi.zip"
    unzip -q -o "$TMP_YAZI/yazi.zip" -d "$TMP_YAZI"
    cp -f "$TMP_YAZI"/yazi-x86_64-unknown-linux-musl/{yazi,ya} "$HOME/.local/bin/"
    chmod +x "$HOME/.local/bin/yazi" "$HOME/.local/bin/ya"
    rm -rf "$TMP_YAZI"
fi

if ! command -v fastfetch >/dev/null 2>&1; then
    curl -sL "https://github.com/fastfetch-cli/fastfetch/releases/latest/download/fastfetch-linux-amd64.tar.gz" | tar -xz --strip-components=3 -C "$HOME/.local/bin/" fastfetch-linux-amd64/usr/bin/fastfetch 2>/dev/null || true
    chmod +x "$HOME/.local/bin/fastfetch" 2>/dev/null || true
fi

echo "[2/6] Instalando JetBrainsMono Nerd Font..."
if [ -z "$(ls -A "$HOME/.local/share/fonts/JetBrainsMonoNerd" 2>/dev/null)" ]; then
    curl -sL "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.tar.xz" | tar -xJ -C "$HOME/.local/share/fonts/JetBrainsMonoNerd/"
    fc-cache -f "$HOME/.local/share/fonts/JetBrainsMonoNerd/"
fi

echo "[3/6] Copiando scripts (larper, matrix, pipes) e configs (fastfetch, starship, btop, tmux, bashrc)..."
cp -f "$REPO_DIR/scripts/"* "$HOME/.local/bin/"
chmod +x "$HOME/.local/bin/larper" "$HOME/.local/bin/matrix" "$HOME/.local/bin/pipes"

cp -f "$REPO_DIR/configs/fastfetch/config.jsonc" "$HOME/.config/fastfetch/config.jsonc"
cp -f "$REPO_DIR/configs/fastfetch/logo.txt" "$HOME/.config/fastfetch/logo.txt"
cp -f "$REPO_DIR/configs/starship.toml" "$HOME/.config/starship.toml"
cp -f "$REPO_DIR/configs/btop/btop.conf" "$HOME/.config/btop/btop.conf"
cp -f "$REPO_DIR/configs/.tmux.conf" "$HOME/.tmux.conf"
cp -f "$REPO_DIR/configs/.bashrc" "$HOME/.bashrc"
cp -f "$REPO_DIR/configs/burn-my-windows/profiles/chrollo-larper.conf" "$HOME/.config/burn-my-windows/profiles/1700000000.conf"

echo "[4/6] Copiando Wallpapers e aplicando Chrollo Lucilfer (Hunter x Hunter)..."
cp -f "$REPO_DIR/wallpapers/"* "$HOME/Imagens/Wallpapers-Linux/"
cp -f "$REPO_DIR/wallpapers/chrollo-hunter-x-hunter.jpg" "$HOME/.config/background"
gsettings set org.gnome.desktop.background picture-uri "file://$HOME/Imagens/Wallpapers-Linux/chrollo-hunter-x-hunter.jpg"
gsettings set org.gnome.desktop.background picture-uri-dark "file://$HOME/Imagens/Wallpapers-Linux/chrollo-hunter-x-hunter.jpg"

echo "[5/6] Aplicando configurações do GNOME (Cubo 3D, Blur my Shell, Burn My Windows, Ptyxis)..."
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.desktop.wm.preferences num-workspaces 4
dconf load /org/gnome/shell/extensions/blur-my-shell/ < "$REPO_DIR/gnome/blur-my-shell.dconf"
dconf load /org/gnome/shell/extensions/desktop-cube/ < "$REPO_DIR/gnome/desktop-cube.dconf"
dconf write /org/gnome/shell/extensions/desktop-cube/background-panorama "'$HOME/Imagens/Wallpapers-Linux/cube-skybox-geneiryodan.png'"
dconf load /org/gnome/shell/extensions/dash-to-dock/ < "$REPO_DIR/gnome/dash-to-dock.dconf"
dconf load /org/gnome/shell/extensions/o-tiling/ < "$REPO_DIR/gnome/o-tiling.dconf"
dconf load /org/gnome/Ptyxis/ < "$REPO_DIR/gnome/ptyxis.dconf"
dconf write /org/gnome/shell/extensions/burn-my-windows/active-profile "'$HOME/.config/burn-my-windows/profiles/1700000000.conf'"

echo "[6/6] Instalando extensões GNOME Shell..."
SHELL_VER=$(gnome-shell --version | awk '{print $3}' | cut -d. -f1)
for UUID in \
    "blur-my-shell@aunetx" \
    "desktop-cube@schneegans.github.com" \
    "burn-my-windows@schneegans.github.com" \
    "compiz-windows-effect@hermes83.github.com" \
    "dash-to-dock@micxgx.gmail.com" \
    "transparent-top-bar@ftpix.com" \
    "o-tiling@oliwebd.github.com" \
    "Vitals@CoreCoding.com"; do
    PK=$(curl -s "https://extensions.gnome.org/extension-info/?uuid=$UUID" | python3 -c "import sys,json; d=json.load(sys.stdin).get('shell_version_map',{}); print(d.get('$SHELL_VER', d.get( sorted(d.keys())[-1] if d else '' , {})).get('pk',''))" 2>/dev/null || true)
    if [ -n "$PK" ]; then
        curl -sL "https://extensions.gnome.org/download-extension/${UUID}.shell-extension.zip?version_tag=${PK}" -o "/tmp/${UUID}.zip"
        gnome-extensions install --force "/tmp/${UUID}.zip" 2>/dev/null || true
        gnome-extensions enable "$UUID" 2>/dev/null || true
        rm -f "/tmp/${UUID}.zip"
    fi
done

echo ""
echo "✔ Instalação concluída! Abra um novo terminal ou digite 'larper' para abrir o Skill Hunter Deck."
