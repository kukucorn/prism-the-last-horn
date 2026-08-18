# 🦄 PRISM — The Last Horn

A monochrome precision-platformer for [js13kGames](https://js13kgames.com/).
The last unicorn gathers 7 elemental colors to purify the world with rainbow light.

- **Constraint:** 13 KB (zipped), no external assets — all graphics via Canvas 2D, all audio via ZzFX.
- **Build:** Vite → single inlined `index.html`.

## Scripts

```bash
npm install
npm run dev     # dev server
npm run build   # single-file index.html in dist/
npm run zip     # build + zip + report size
```

## Controls

| Action | Keys |
| --- | --- |
| Move | ← / → (A / D) |
| Jump | ↑ / W / Space (coyote + buffer + variable height) |
| Element skill | X / J |
| Swap element | C / L / Shift (Red→Orange→Yellow→Green→Blue→Indigo→Violet) |
