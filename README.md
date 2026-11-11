# 🕷️ Fedora GNOME Larper Rice — Gen'ei Ryodan // No.0 (Chrollo Edition)

Setup completo de customização (**Rice / Linux Larper**) para **Fedora Workstation (GNOME Wayland)** inspirado em **Hunter x Hunter (Chrollo Lucilfer / Trupe Fantasma)**, combinando:
- **Cubo 3D na troca de áreas de trabalho** (`Desktop Cube`)
- **Janelas em Vidro Fosco (Blur + Transparência)** no Terminal (`Ptyxis`) e Gerenciador de Arquivos (`Nautilus`)
- **Efeitos de desintegração Matrix / Glitch Cyberpunk** ao abrir/fechar janelas (`Burn My Windows`) + **Janelas Elásticas** (`Compiz Wobbly Windows`)
- **Fastfetch Customizado** com a Aranha de 12 patas + Cruz Invertida (`GEN'EI RYODAN // NO.0`) e HUD de telemetria (`[SKILL HUNTER // SYS.HUD]`)
- **Prompt Starship** de 2 linhas em roxo/carmesim com ícones **JetBrainsMono Nerd Font**
- **Skill Hunter Deck (`larper`)**: Painel multiplexado em 4 quadrantes no `tmux` rodando `fastfetch`, `btop`, `matrix --purple` e `pipes` simultaneamente com consumo quase zero de RAM (~24 MB).

---

## 🖼️ Wallpapers Inclusos

| Hunter x Hunter (Chrollo Lucilfer) | Evangelion NERV // MAGI HUD | Linux Kernel Cyber HUD |
| :---: | :---: | :---: |
| ![Chrollo Wallpaper](wallpapers/chrollo-hunter-x-hunter.jpg) | ![Evangelion HUD](wallpapers/evangelion-nerv-magi-hud.png) | ![Cyber HUD](wallpapers/linux-kernel-cyber-hud.png) |

---

## 🖥️ Preview do Terminal (`fastfetch`)

```text
                                           ╭─── 󰣛 user@fedora ─── [SKILL HUNTER // SYS.HUD] ───╮
          ╲         ▄█▄         ╱          │ 󰣛 Distro   ❯ Fedora Linux Workstation Edition
       ╲   ╲        ███        ╱   ╱       │ 󰌽 Kernel   ❯ Linux 7.x x86_64
        ╲   ╲    ▄▄█████▄▄    ╱   ╱        │ 󱂬 WM/Comp  ❯ Mutter (Wayland)
         ╲   ╲ ▄███████████▄ ╱   ╱         │ 󰆍 Shell    ❯ bash
     ╲    ╲   ████▀▀   ▀▀████   ╱    ╱     │  Term     ❯ Ptyxis
      ╲    ╲ ███▀   ▄█▄   ▀███ ╱    ╱      │ 󰏖 Pkgs     ❯ rpm + flatpak
       ╲    ████   ██▀██   ████    ╱       │ 󰅐 Uptime   ❯ 1 day, 32 mins
   ─────╲──█████   ██▄██   █████──╱─────   ├────────────── [ TELEMETRY // HARDWARE ] ──────────────┤
       ╱    ████    ▀█▀    ████    ╲       │ 󰻠 CPU      ❯ Intel Core (6T) @ 3.30 GHz
      ╱    ╱ ███▄   ███   ▄███ ╲    ╲      │ 󰢮 GPU      ❯ Intel UHD Graphics
     ╱    ╱   ████▄▄███▄▄████   ╲    ╲     │ 󰍛 Memory   ❯ [ █████░░░░░░░░░ ] 3.75 GiB / 11.36 GiB (33%)
         ╱   ╱ ▀███████████▀ ╲   ╲         │ 󰋊 Disk     ❯ [ █░░░░░░░░░░░░░ ] 20.66 GiB / 474.35 GiB (4%)
        ╱   ╱    ▀▀█████▀▀    ╲   ╲        │ 󰁹 Battery  ❯ [ ████████░░░░░░ ] (80%)
       ╱   ╱       █████       ╲   ╲       ╰───────────────────────────────────────────────────────╯
          ╱         ▀█▀         ╲            ● ● ● ● ● ● ● ●
         ── GEN'EI RYODAN // NO.0 ──
```

---

## ⚡ Instalação Automática (1 Comando)

Se você usa **Fedora Workstation (GNOME)**, basta clonar este repositório e rodar o script `install.sh` (não precisa nem de `sudo` para as ferramentas do terminal):

```bash
git clone https://github.com/amyrindequi-design/fedora-gnome-larper-rice.git
cd fedora-gnome-larper-rice
chmod +x install.sh
./install.sh
```

Depois que terminar:
1. Abra um novo terminal para ver o novo **Fastfetch + Starship**.
2. Digite `larper` para abrir o **Skill Hunter Deck** (painel 4-em-1 com `fastfetch`, `btop`, `matrix --purple` e `pipes`).

---

## 🛠️ Tutorial Passo a Passo (Como deixar igual manualmente)

Caso queira configurar parte por parte ou adaptar em outra distro Linux com GNOME:

### 1. Instalar a Fonte (`JetBrainsMono Nerd Font`)
Os ícones do terminal (`󰣛`, `󰌽`, `󰻠`, ``) precisam de uma **Nerd Font**:
```bash
mkdir -p ~/.local/share/fonts/JetBrainsMonoNerd
curl -sL "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.tar.xz" \
  | tar -xJ -C ~/.local/share/fonts/JetBrainsMonoNerd/
fc-cache -f ~/.local/share/fonts/JetBrainsMonoNerd/
```
Para ativar no terminal padrão do Fedora (**Ptyxis**):
```bash
gsettings set org.gnome.Ptyxis use-system-font false
gsettings set org.gnome.Ptyxis font-name 'JetBrainsMono Nerd Font 10.5'
```

---

### 2. Deixar o Terminal e o Gerenciador de Arquivos Transparentes (Vidro Fosco)
1. Instale a extensão **Blur my Shell** (`blur-my-shell@aunetx`) pelo **Extension Manager**.
2. Carregue as configurações de transparência (que ativam o blur no `Nautilus` e no `Ptyxis` e impedem que o modo de economia de bateria desligue a transparência):
```bash
dconf load /org/gnome/shell/extensions/blur-my-shell/ < gnome/blur-my-shell.dconf
dconf load /org/gnome/Ptyxis/ < gnome/ptyxis.dconf
```

---

### 3. Ativar o Cubo 3D e Efeitos de Janela no GNOME
Instale pelo **Extension Manager** (ou pelo site [extensions.gnome.org](https://extensions.gnome.org)) as extensões:
- **Desktop Cube** (`desktop-cube@schneegans.github.com`) — Troca de área de trabalho em cubo 3D com parallax.
- **Burn My Windows** (`burn-my-windows@schneegans.github.com`) — Desintegra janelas com efeito Matrix, TV Glitch e Energize.
- **Compiz windows effect** (`compiz-windows-effect@hermes83.github.com`) — Janelas elásticas/gelatinosas ao arrastar.
- **Dash to Dock** (`dash-to-dock@micxgx.gmail.com`) + **Transparent Top Bar** (`transparent-top-bar@ftpix.com`) + **O-Tiling** (`o-tiling@oliwebd.github.com`).

Aplique os ajustes finos do Cubo 3D e do Burn My Windows:
```bash
# Fixar 4 áreas de trabalho para formar as 4 faces do cubo 3D
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.desktop.wm.preferences num-workspaces 4

# Carregar configurações 3D (parallax 0.85, separação 100px, explosão 3D ativa)
dconf load /org/gnome/shell/extensions/desktop-cube/ < gnome/desktop-cube.dconf

# Copiar perfil Matrix + TV Glitch + Energize para o Burn My Windows
mkdir -p ~/.config/burn-my-windows/profiles
cp configs/burn-my-windows/profiles/chrollo-larper.conf ~/.config/burn-my-windows/profiles/1700000000.conf
dconf write /org/gnome/shell/extensions/burn-my-windows/active-profile "'$HOME/.config/burn-my-windows/profiles/1700000000.conf'"
```

---

### 4. Configurar o Fastfetch (`Gen'ei Ryodan // No.0`) e Prompt Starship
Copie os arquivos da pasta `configs/`:
```bash
mkdir -p ~/.config/fastfetch ~/.config/btop
cp configs/fastfetch/config.jsonc ~/.config/fastfetch/config.jsonc
cp configs/fastfetch/logo.txt ~/.config/fastfetch/logo.txt
cp configs/starship.toml ~/.config/starship.toml
cp configs/btop/btop.conf ~/.config/btop/btop.conf
cp configs/.tmux.conf ~/.tmux.conf
cp configs/.bashrc ~/.bashrc
```

---

### 5. Instalar os Scripts do Painel `larper` (`matrix`, `pipes`, `larper`)
```bash
mkdir -p ~/.local/bin
cp scripts/larper scripts/matrix scripts/pipes ~/.local/bin/
chmod +x ~/.local/bin/larper ~/.local/bin/matrix ~/.local/bin/pipes
```

---

## 🎮 Comandos e Atalhos Disponíveis

| Comando / Atalho | O que faz |
| :--- | :--- |
| `larper` | Abre o **Skill Hunter Deck** em 4 painéis no `tmux` (`fastfetch` + `btop` + `matrix --purple` + `pipes`) |
| `fetch` | Limpa o terminal e exibe a arte da Trupe Fantasma + telemetria do sistema |
| `matrix-chrollo` | Chuva digital estilo Matrix em roxo/vermelho (`q` para sair) |
| `matrix` / `matrix --red` | Chuva Matrix verde clássica ou vermelha (`q` para sair) |
| `pipes` | Protetor de tela de tubulações neon no terminal (`q` para sair) |
| `btop` (ou `top`) | Monitor de hardware em Braille com fundo transparente (`q` para sair) |
| `yazi` (ou `files`) | Gerenciador de arquivos no terminal controlado pelas setas (`q` para sair) |
| `Ctrl + Alt + ← / →` | Gira o **Cubo 3D** entre as áreas de trabalho |
| **Arrastar área vazia do desktop** | Gira o **Cubo 3D** livremente em 360° com o mouse |

---

## 📂 Estrutura do Repositório

```text
├── configs/
│   ├── .bashrc                                    # Aliases + inicialização do fastfetch e starship
│   ├── .tmux.conf                                 # Barra superior GEN'EI RYODAN + suporte a mouse
│   ├── starship.toml                              # Prompt futurista de 2 linhas em roxo/carmesim
│   ├── btop/btop.conf                             # Configuração transparente em Braille do btop
│   ├── burn-my-windows/profiles/chrollo-larper.conf # Efeitos Matrix + TV Glitch + Energize
│   └── fastfetch/
│       ├── config.jsonc                           # Layout [SKILL HUNTER // SYS.HUD]
│       └── logo.txt                               # Arte ASCII Aranha Nº 0 + Cruz Invertida
├── gnome/
│   ├── blur-my-shell.dconf                        # Blur no Nautilus, Ptyxis, Dock e Painel
│   ├── desktop-cube.dconf                         # Parallax 3D e separação de faces do Cubo
│   ├── burn-my-windows.dconf                      # Perfil ativo de efeitos de janela
│   ├── dash-to-dock.dconf                         # Configurações da dock
│   ├── o-tiling.dconf                             # Tiling de janelas
│   ├── ptyxis.dconf                               # Fonte Nerd Font + opacidade 84% no terminal
│   └── enabled-extensions.txt                     # Lista de extensões GNOME utilizadas
├── scripts/
│   ├── larper                                     # Launcher do painel 4-em-1 no tmux
│   ├── matrix                                     # Chuva Matrix em Katakana (verde/roxo/vermelho)
│   └── pipes                                      # Animação de tubulações neon no terminal
├── wallpapers/
│   ├── chrollo-hunter-x-hunter.jpg                # Wallpaper principal Chrollo Lucilfer
│   ├── evangelion-nerv-magi-hud.png               # Wallpaper custom Evangelion NERV / MAGI
│   └── linux-kernel-cyber-hud.png                 # Wallpaper custom Linux Kernel Cyber HUD
└── install.sh                                     # Instalador automático em 1 comando
```
