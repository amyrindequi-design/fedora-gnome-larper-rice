#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "Execute com sudo:"
    echo "  sudo bash $0"
    exit 1
fi

REAL_USER="${SUDO_USER:-amyr}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)

REPO_PLYMOUTH="$REAL_HOME/Documentos/Projetos-e-Apresentacoes/fedora-gnome-larper-rice/plymouth/genei-ryodan"
if [[ ! -d "$REPO_PLYMOUTH" ]]; then
    REPO_PLYMOUTH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/plymouth/genei-ryodan"
fi

WALLPAPER_SRC="$REAL_HOME/Imagens/Wallpapers-Linux/chrollo-dark-throne.jpg"
WALLPAPER_DST="/usr/share/backgrounds/chrollo-dark-throne.jpg"

echo "[1/3] Instalando Ulauncher..."
if ! command -v ulauncher >/dev/null 2>&1; then
    dnf install -y ulauncher
else
    echo "  -> Ulauncher ja instalado."
fi

echo "[2/3] Aplicando tema Plymouth 'genei-ryodan'..."
if [[ ! -f /usr/lib64/plymouth/script.so ]]; then
    dnf install -y plymouth-plugin-script
fi
if [[ -d "$REPO_PLYMOUTH" ]]; then
    mkdir -p /usr/share/plymouth/themes/genei-ryodan
    cp -f "$REPO_PLYMOUTH"/* /usr/share/plymouth/themes/genei-ryodan/
    chmod 644 /usr/share/plymouth/themes/genei-ryodan/*
    plymouth-set-default-theme -R genei-ryodan
    echo "  -> Plymouth atualizado e initramfs regenerado."
else
    echo "  ! Diretorio Plymouth nao encontrado em $REPO_PLYMOUTH" >&2
fi

echo "[3/3] Configurando fundo escuro do GDM (tela de login)..."
if [[ -f "$WALLPAPER_SRC" ]]; then
    install -Dm644 "$WALLPAPER_SRC" "$WALLPAPER_DST"
    mkdir -p /etc/dconf/profile /etc/dconf/db/gdm.d

    cat > /etc/dconf/profile/gdm <<'EOF'
user-db:user
system-db:gdm
file-db:/usr/share/gdm/greeter-dconf-defaults
EOF

    cat > /etc/dconf/db/gdm.d/01-larper-background <<EOF
[org/gnome/desktop/background]
picture-uri='file://$WALLPAPER_DST'
picture-uri-dark='file://$WALLPAPER_DST'
picture-options='zoom'

[org/gnome/desktop/screensaver]
picture-uri='file://$WALLPAPER_DST'
picture-options='zoom'

[org/gnome/desktop/interface]
color-scheme='prefer-dark'
EOF

    dconf update
    echo "  -> dconf do GDM atualizado com chrollo-dark-throne.jpg."
else
    echo "  ! Wallpaper nao encontrado em $WALLPAPER_SRC" >&2
fi

echo
echo "Pronto! Inicie o Ulauncher no seu usuario com:"
echo "  nohup ulauncher --hide-window >/dev/null 2>&1 &"
echo "Depois pressione Super + Espaco para testar."
