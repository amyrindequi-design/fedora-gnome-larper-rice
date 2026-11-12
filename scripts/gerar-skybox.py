#!/usr/bin/env python3
"""Gera um panorama equiretangular 360° (skybox) cyberpunk roxo/carmesim para o Desktop Cube."""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HOME = Path.home()
FONT_DIR = HOME / ".local/share/fonts/JetBrainsMonoNerd"

W, H = 4096, 2048
HZ = H // 2  # horizonte
random.seed(7)

img = Image.new("RGB", (W, H), (0, 0, 0))
px = img.load()

# --- Céu: gradiente vertical (zênite quase preto -> horizonte magenta) ---
for y in range(HZ):
    t = y / HZ  # 0 topo, 1 horizonte
    t2 = t ** 2.4
    r = int(6 + 120 * t2)
    g = int(3 + 10 * t2)
    b = int(16 + 90 * t2)
    for x in range(W):
        px[x, y] = (r, g, b)

# --- Chão: escuro com leve brilho perto do horizonte ---
for y in range(HZ, H):
    t = (y - HZ) / HZ
    glow = math.exp(-t * 9)
    r = int(8 + 90 * glow)
    g = int(2 + 6 * glow)
    b = int(14 + 60 * glow)
    for x in range(W):
        px[x, y] = (r, g, b)

draw = ImageDraw.Draw(img, "RGBA")

# --- Estrelas ---
for _ in range(2600):
    x = random.randrange(W)
    y = int(random.random() ** 1.6 * (HZ - 120))
    a = random.randint(60, 255)
    s = random.choice([1, 1, 1, 2])
    c = random.choice([(255, 255, 255), (216, 180, 254), (254, 202, 202)])
    draw.rectangle([x, y, x + s - 1, y + s - 1], fill=c + (a,))

# --- Lua carmesim gigante com a aranha (uma para cada "lado" do cubo) ---
glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow_layer)


def spider(d, cx, cy, s, col):
    # corpo
    d.ellipse([cx - 0.18 * s, cy - 0.05 * s, cx + 0.18 * s, cy + 0.42 * s], fill=col)
    d.ellipse([cx - 0.12 * s, cy - 0.30 * s, cx + 0.12 * s, cy - 0.02 * s], fill=col)
    # 8 patas articuladas
    for side in (-1, 1):
        for i, (ax, ay, kx, ky, fx, fy) in enumerate([
            (0.10, -0.15, 0.45, -0.55, 0.62, -0.20),
            (0.12, -0.05, 0.55, -0.30, 0.80, 0.05),
            (0.12, 0.05, 0.55, 0.10, 0.80, 0.45),
            (0.10, 0.15, 0.45, 0.40, 0.60, 0.80),
        ]):
            p0 = (cx + side * ax * s, cy + ay * s)
            p1 = (cx + side * kx * s, cy + ky * s)
            p2 = (cx + side * fx * s, cy + fy * s)
            w = max(2, int(s * 0.035))
            d.line([p0, p1, p2], fill=col, width=w, joint="curve")


moons = [(W * 0.125, 430, 250), (W * 0.625, 470, 170)]
for mx, my, mr in moons:
    for k in range(8, 0, -1):
        rr = mr + k * 38
        gd.ellipse([mx - rr, my - rr, mx + rr, my + rr], fill=(239, 68, 68, 10))
glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(40))
img.paste(glow_layer, (0, 0), glow_layer)
draw = ImageDraw.Draw(img, "RGBA")

for mx, my, mr in moons:
    draw.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(185, 28, 28, 255))
    draw.ellipse([mx - mr * 0.92, my - mr * 0.92, mx + mr * 0.92, my + mr * 0.92], fill=(220, 38, 38, 255))
    # crateras
    for _ in range(14):
        a = random.random() * math.tau
        rd = random.random() * mr * 0.75
        cr = random.randint(int(mr * 0.04), int(mr * 0.13))
        cx, cy = mx + math.cos(a) * rd, my + math.sin(a) * rd
        draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(170, 22, 22, 140))
    spider(draw, mx, my - mr * 0.05, mr * 0.95, (12, 4, 18, 245))
    # número 0 da trupe
    try:
        f = ImageFont.truetype(str(FONT_DIR / "JetBrainsMonoNerdFont-ExtraBold.ttf"), int(mr * 0.22))
    except OSError:
        f = ImageFont.load_default()
    draw.text((mx, my + mr * 0.16), "0", font=f, fill=(248, 250, 252, 230), anchor="mm")

# --- Skyline neon (silhuetas de prédios ao longo de 360°) ---
x = 0
while x < W:
    bw = random.randint(30, 110)
    bh = int(random.random() ** 1.8 * 330) + 40
    top = HZ - bh
    draw.rectangle([x, top, x + bw, HZ], fill=(10, 4, 20, 255))
    # janelas
    for wy in range(top + 10, HZ - 6, 14):
        for wx in range(x + 6, x + bw - 6, 11):
            if random.random() < 0.22:
                c = random.choice([(168, 85, 247), (239, 68, 68), (244, 114, 182), (226, 232, 240)])
                draw.rectangle([wx, wy, wx + 4, wy + 6], fill=c + (random.randint(120, 230),))
    # antena com luz vermelha
    if bh > 220 and random.random() < 0.6:
        ax = x + bw // 2
        draw.line([ax, top, ax, top - 50], fill=(30, 10, 40, 255), width=3)
        draw.ellipse([ax - 5, top - 56, ax + 5, top - 46], fill=(239, 68, 68, 255))
    # contorno neon no topo
    draw.line([x, top, x + bw, top], fill=(168, 85, 247, 160), width=2)
    x += bw + random.randint(0, 18)

# --- Grade neon synthwave no chão (perspectiva correta em equiretangular) ---
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gr = ImageDraw.Draw(grid)
cam_h = 1.0
# círculos concêntricos (distância k) -> linhas horizontais
for k in [0.6 * 1.18 ** i for i in range(40)]:
    elev = math.atan(cam_h / k)  # ângulo abaixo do horizonte
    y = HZ + elev / math.pi * H
    if y >= H - 1:
        continue
    fade = max(40, min(255, int(255 * (y - HZ) / (H * 0.18))))
    gr.line([(0, y), (W, y)], fill=(236, 72, 153, fade), width=3)
# raios (longitudes) -> linhas verticais
for i in range(64):
    xx = i * W / 64
    gr.line([(xx, HZ + 6), (xx, H)], fill=(168, 85, 247, 200), width=3)
glow = grid.filter(ImageFilter.GaussianBlur(6))
img.paste(glow, (0, 0), glow)
img.paste(grid, (0, 0), grid)
draw = ImageDraw.Draw(img, "RGBA")

# linha do horizonte brilhante
hz = Image.new("RGBA", (W, H), (0, 0, 0, 0))
hd = ImageDraw.Draw(hz)
hd.rectangle([0, HZ - 3, W, HZ + 3], fill=(244, 114, 182, 255))
hz = hz.filter(ImageFilter.GaussianBlur(10))
img.paste(hz, (0, 0), hz)
draw.line([(0, HZ), (W, HZ)], fill=(255, 210, 230, 255), width=2)

# --- Textos HUD flutuando no céu (um em cada face) ---
try:
    mono = ImageFont.truetype(str(FONT_DIR / "JetBrainsMonoNerdFont-Bold.ttf"), 46)
except OSError:
    mono = ImageFont.load_default()
labels = [
    (W * 0.375, "[ WORKSPACE 02 // GEN'EI RYODAN ]"),
    (W * 0.875, "[ WORKSPACE 04 // SKILL HUNTER ]"),
]
for lx, txt in labels:
    draw.text((lx, 260), txt, font=mono, fill=(216, 180, 254, 200), anchor="mm")
    draw.line([(lx - 420, 300), (lx + 420, 300)], fill=(239, 68, 68, 150), width=2)

# Scanlines sutis
for y in range(0, H, 4):
    draw.line([(0, y), (W, y)], fill=(0, 0, 0, 22))

out_dir = HOME / "Imagens/Wallpapers-Linux"
out_dir.mkdir(parents=True, exist_ok=True)
out = out_dir / "cube-skybox-geneiryodan.png"
img.save(out, optimize=True)
print("salvo:", out)
