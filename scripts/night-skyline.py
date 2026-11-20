#!/usr/bin/env python3
"""Generates public/panoramas/night.jpg (+ thumbs/night.jpg): a 360° equirectangular night skyline.

No free (CC0) 360° photo of a dense night skyline exists — Poly Haven's night panoramas are all street-level
squares — so this paints one: a downtown of lit towers across a river, the way Manhattan reads from the far
bank. Deterministic (fixed seed), so re-running gives the same image.

    python3 scripts/night-skyline.py && python3 scripts/panorama-light.py

Layout (equirectangular, x = azimuth, y = elevation, horizon in the middle row; the room turns it with
Exhibition.outdoor.rotationY): the densest, tallest cluster faces u = 0.5, thinning out to low-rise blocks
behind the viewer. Below the horizon: the river with the lights' reflections streaked down, then a dark
embankment at the viewer's feet. Painted at 8192 px wide and box-downsampled to 4096 (anti-aliased windows).
Needs numpy + Pillow.
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
W, H = 8192, 4096
OUT_W = 4096
PX_PER_DEG = W / 360
HORIZON = H // 2
rng = np.random.default_rng(20261120)


def row_of(elev_deg):
    return int(round(HORIZON - elev_deg * PX_PER_DEG))


def soft_blur(img, scale):
    """Wide, cheap glow: box-downsample, then bilinear back up (twice, for a gaussian-ish falloff)."""
    h, w = img.shape[:2]
    out = img
    for _ in range(2):
        small_w, small_h = max(1, w // scale), max(1, h // scale)
        chans = [Image.fromarray(out[..., c]).resize((small_w, small_h), Image.BOX) for c in range(3)]
        chans = [np.asarray(ch.resize((w, h), Image.BILINEAR), dtype=np.float32) for ch in chans]
        out = np.stack(chans, axis=-1)
    return out


# --- Sky -------------------------------------------------------------------------------------------------
def sky():
    img = np.zeros((H, W, 3), np.float32)
    elev = (0.5 - (np.arange(H) + 0.5) / H) * 180  # degrees
    top = np.array([0.0025, 0.003, 0.007])  # almost black, a hint of navy
    glow = np.array([0.075, 0.042, 0.022])  # sodium light pollution right above the skyline
    t = np.exp(-np.clip(elev, 0, None) / 6.0)[:, None]
    col = top[None, :] * (1 - t) + glow[None, :] * t
    img[:] = col[:, None, :]
    # Soft, isotropic cloud haze (coarse noise, smoothed twice) — no streaks.
    coarse = rng.random((12, 24)).astype(np.float32)
    noise = np.asarray(Image.fromarray(coarse).resize((W // 8, H // 8), Image.BICUBIC).resize((W, H), Image.BILINEAR), np.float32)
    img *= (0.8 + 0.4 * np.clip(noise, 0, 1))[..., None]
    return img


# --- Buildings -------------------------------------------------------------------------------------------
WARM = np.array([1.0, 0.72, 0.38])
WHITE = np.array([0.95, 0.9, 0.78])
COOL = np.array([0.7, 0.82, 1.0])
CROWNS = [np.array(c) for c in ([0.25, 0.55, 1.0], [0.3, 1.0, 0.85], [1.0, 0.95, 0.85], [1.0, 0.45, 0.25], [0.85, 0.4, 1.0])]


def density(u):
    """0..1 — how built-up the skyline is at azimuth u (downtown at u = 0.5, wrapping)."""
    d = min(abs(u - 0.5), 1 - abs(u - 0.5))  # 0 at the centre, 0.5 behind
    return math.exp(-((d / 0.2) ** 2))


def window_grid(img, x0, x1, top_row, base_row, tint, lit_share, level, rng):
    floor_px = int(rng.choice([3, 4]))
    col_px = int(rng.choice([3, 4, 4, 5]))
    win_w = max(1, col_px - int(rng.choice([1, 2])))
    win_h = max(1, floor_px - 1)
    n_cols = max(0, (x1 - x0 - 2) // col_px)
    if n_cols == 0:
        return
    for r in range(top_row + 2, base_row - 1, floor_px):
        p = lit_share if rng.random() < 0.8 else lit_share * 0.1  # some floors almost dark (offices after hours)
        on = rng.random(n_cols) < p
        bright = level * rng.uniform(0.45, 1.0, n_cols)
        for k in np.nonzero(on)[0]:
            cx = x0 + 1 + k * col_px
            img[r : r + win_h, cx : cx + win_w] = tint * bright[k]


def draw_building(img, x0, w, top_row, base_row, haze, rng):
    """A tower: dark facade, up to two set-back tiers, a sparse window grid, maybe a lit crown or a spire."""
    x1 = min(x0 + w, W)
    if x1 - x0 < 4 or top_row >= base_row:
        return
    facade = np.array([0.006, 0.007, 0.01]) * (1 + haze * 3)
    tint = [WARM, WHITE, COOL][rng.choice(3, p=[0.6, 0.3, 0.1])]
    lit_share = rng.uniform(0.08, 0.5) if rng.random() > 0.12 else 0.02
    level = rng.uniform(0.35, 0.9) * (1 - 0.6 * haze)

    height = base_row - top_row
    tiers = [(x0, x1, top_row)]
    if height > 90 and rng.random() < 0.6:
        n = int(rng.integers(1, 3))
        cx0, cx1, ctop = x0, x1, top_row
        for _ in range(n):
            inset = max(2, int((cx1 - cx0) * rng.uniform(0.12, 0.25)))
            cut = int(height * rng.uniform(0.1, 0.22))
            tiers[-1] = (cx0, cx1, ctop + cut)  # the wider tier stops lower
            cx0, cx1, ctop = cx0 + inset, cx1 - inset, ctop
            tiers.append((cx0, cx1, ctop))
    for tx0, tx1, ttop in tiers:
        if tx1 - tx0 < 3:
            continue
        img[ttop:base_row, tx0:tx1] = facade
        window_grid(img, tx0, tx1, ttop, base_row, tint, lit_share, level, rng)

    cx0, cx1, ctop = tiers[-1]
    if height > 110 and rng.random() < 0.16:
        c = CROWNS[rng.integers(len(CROWNS))] * (0.55 - 0.3 * haze)
        band = max(2, height // 60)
        img[ctop : ctop + band, cx0:cx1] = c
    if height > 160 and rng.random() < 0.4:
        # Spire / stepped crown tapering to a mast with a red beacon.
        spire_h = int(height * rng.uniform(0.1, 0.28))
        mid = (cx0 + cx1) // 2
        half0 = max(2, (cx1 - cx0) // 3)
        lit = rng.random() < 0.5
        for i in range(spire_h):
            half = max(1, int(half0 * (1 - i / spire_h) ** 1.4))
            row = ctop - i
            img[row, mid - half : mid + half] = facade
            if lit and i % 4 == 0:
                img[row, mid - half : mid + half] = WHITE * 0.7 * (1 - i / spire_h)
        img[ctop - spire_h - 3 : ctop - spire_h + 1, mid - 1 : mid + 2] = [1.0, 0.1, 0.06]


def skyline(img):
    # Layers back to front: far (hazy, short), mid, near (tall, crisp). Heights in degrees above the horizon.
    layers = [
        dict(haze=0.7, h=(1.0, 6.0), w=(0.4, 1.4), gap=0.1),
        dict(haze=0.4, h=(1.5, 13.0), w=(0.6, 2.0), gap=0.2),
        dict(haze=0.15, h=(2.0, 22.0), w=(0.8, 2.6), gap=0.5),
        dict(haze=0.0, h=(2.5, 30.0), w=(1.2, 3.4), gap=1.4),
    ]
    base_row = row_of(0.35)  # the far bank sits a hair above the waterline
    for layer in layers:
        x = 0
        while x < W:
            u = x / W
            dens = density(u)
            w_deg = rng.uniform(*layer["w"])
            w = max(6, int(w_deg * PX_PER_DEG))
            lo, hi = layer["h"]
            # Downtown: towers; elsewhere low blocks.
            h_deg = lo + (hi - lo) * (dens ** 0.9) * rng.uniform(0.25, 1.0) ** 2
            if dens < 0.15:
                h_deg = min(h_deg, lo + 1.2)
            # The nearest layer only stands downtown, with gaps the farther ones show through.
            if layer["haze"] == 0.0 and (dens < 0.35 or rng.random() < 0.35):
                x += w
                continue
            if rng.random() < 0.9 or dens > 0.4:
                draw_building(img, x, w, row_of(h_deg), base_row, layer["haze"], rng)
            gap = rng.uniform(0, layer["gap"]) * (1 - dens * 0.8)
            x += w + int(gap * PX_PER_DEG)
    # Waterfront street lights along the far bank.
    for x in range(0, W, 11):
        if rng.random() < 0.5:
            img[base_row - 2 : base_row, x : x + 2] = WARM * rng.uniform(0.4, 0.8)
    return base_row


def vertical_blur(a, scale):
    """Blur along y only: shrink the height, bring it back."""
    h, w = a.shape[:2]
    chans = []
    for c in range(3):
        im = Image.fromarray(a[..., c]).resize((w, max(1, h // scale)), Image.BOX).resize((w, h), Image.BILINEAR)
        chans.append(np.asarray(im, np.float32))
    return np.stack(chans, axis=-1)


def water_and_ground(img, base_row):
    # River: the skyline mirrored, smeared downward into streaks, dim, with horizontal ripples.
    water_top = base_row
    water_bottom = row_of(-32)
    span = water_bottom - water_top
    src = img[max(0, water_top - span) : water_top][::-1].copy()
    if src.shape[0] < span:
        src = np.concatenate([src, np.zeros((span - src.shape[0], W, 3), np.float32)])
    refl = vertical_blur(soft_blur(src, 4), 14)
    # Broken by waves: per-row brightness bands, strongest near the far bank.
    ripple = np.clip(rng.normal(0.8, 0.55, (span, 1, 1)), 0, 2).astype(np.float32)
    fade = (np.clip(1 - np.linspace(0, 1, span) / 0.55, 0, 1) ** 1.5 * 0.32).astype(np.float32)[:, None, None]
    img[water_top:water_bottom] = np.array([0.002, 0.003, 0.006], np.float32) + refl * ripple * fade
    # Embankment at the viewer's feet: near-black stone.
    rows = H - water_bottom
    ground = np.array([0.006, 0.006, 0.006], np.float32)
    tex = 0.8 + 0.4 * rng.random((rows, W, 1)).astype(np.float32)
    img[water_bottom:] = ground * tex
    img[water_bottom : water_bottom + 6] = np.array([0.03, 0.026, 0.022], np.float32)  # quay edge catching the city glow


def main():
    img = sky()
    base_row = skyline(img)
    # Bloom/haze around the lights (before the reflection, so the river mirrors it too).
    band = img[row_of(40) : base_row + 4]
    bright = np.clip(band - 0.3, 0, None)
    band += soft_blur(bright, 24) * 1.2 + soft_blur(bright, 5) * 0.35
    img[row_of(40) : base_row + 4] = band
    water_and_ground(img, base_row)

    srgb = np.where(img <= 0.0031308, img * 12.92, 1.055 * np.power(np.clip(img, 0, None), 1 / 2.4) - 0.055)
    out = Image.fromarray((np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8))
    out = out.resize((OUT_W, OUT_W // 2), Image.BOX)
    out.save(ROOT / "public" / "panoramas" / "night.jpg", quality=90, progressive=True, optimize=True)
    out.resize((480, 240), Image.LANCZOS).save(ROOT / "public" / "panoramas" / "thumbs" / "night.jpg", quality=85, optimize=True)
    print("wrote public/panoramas/night.jpg")


if __name__ == "__main__":
    main()
