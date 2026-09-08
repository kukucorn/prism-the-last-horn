# 🦄 PRISM — The Last Horn

A monochrome precision-platformer for **[js13kGames](https://js13kgames.com/)** — the whole
game ships in a **13 KB** zip with **no external assets**: every pixel is drawn with Canvas 2D
and every sound is synthesized with [ZzFX](https://github.com/KilledByAPixel/ZzFX).

The world has been drained of colour by **The Monochrome**. You are the last unicorn — gather the
seven elemental colours, one per stage, and outrun the darkness to give the world its light back.

## Play

```bash
npm install
npm run dev      # Vite dev server (http://localhost:5173)
```

Press any key on the title to begin.

| Action | Keys |
| --- | --- |
| Move | `←` `→` (or `A` `D`) |
| Jump | `↑` / `W` / `Space` — coyote time, jump buffering, variable height |
| Element skill | `X` / `J` |
| Swap element | `C` / `L` / `Shift` |

## The seven elements

You unlock one colour per stage (progressive), and each stage is a gate only its element can pass:

| Colour | Element | Skill |
| --- | --- | --- |
| 🔴 Red | **Fire** | **Dash** — a fast, invincible burst that crosses gaps and burns spikes |
| 🟠 Orange | **Earth** | **Slam** — drop straight down and smash through breakable rock |
| 🟡 Yellow | **Light** | **Blink** — teleport forward through thin walls |
| 🟢 Green | **Nature** | **Double-jump** + glide — clear wide bottomless gaps |
| 🔵 Blue | **Water** | **Float** — hold to drift upward and rise through tall shafts |
| 🟣 Indigo | **Ice** | **Freeze** — walk a spike gauntlet, freezing each spike you touch |
| 🟪 Violet | **Gravity** | **Flip** — invert gravity and walk on the ceiling |

Each stage repeats its gate 2–3 times with connecting platforming, and scrolls with the camera.
The finale is a left-to-right **chase**: The Monochrome, a relentless wall of un-colour, hunts you
from behind while you use every skill in turn to reach the light. Touch it and you're thrown back
to the last checkpoint.

## How it fits in 13 KB

- **Graphics** — pure Canvas 2D. The unicorn is a procedural pixel sprite (muscle-shaded body that
  tints to the current element, a rainbow mane & tail) with a 4-beat gallop, a leap frame and body
  bounce, baked once per element/frame to offscreen canvases.
- **Levels** — compact string tilemaps parsed into merged collision boxes.
- **Audio** — [ZzFX](https://github.com/KilledByAPixel/ZzFX) micro-synth (MIT, Frank Force).
- **Build** — [Vite](https://vitejs.dev/) + `vite-plugin-singlefile` inline everything into one
  `index.html`; Terser minifies; [Roadroller](https://github.com/lifthrasiir/roadroller)
  context-mixing-packs the JS as a self-extracting script.

```bash
npm run build    # single-file dist/index.html
npm run zip      # build + Roadroller pack + zip + size report vs the 13312-byte budget
```

## Credits

- Audio: **ZzFX** by Frank Force (MIT).
- Compression: **Roadroller** by Kang Seonghoon.
- The unicorn's gait and form study the **[Muybridge horse locomotion plates](https://muybridgearchive.com/)**.

Built with [Claude Code](https://claude.com/claude-code).
