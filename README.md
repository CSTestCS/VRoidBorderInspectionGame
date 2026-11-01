# Haven Checkpoint

A first-person, post-apocalyptic customs and decontamination game for Windows. You are the officer at
Checkpoint 7, the only entrance to a high-tech underground haven. Every day a random number of
wasteland survivors arrive. Each one must be identified, stripped, searched, hosed down and inspected
before you decide where they go.

Visitors are generated from VRoid (`.vrm`) models: a random model, random skin/hair/eye/clothing
colours, random underwear (with optional prints), and anywhere from no problems (50%) to every problem
at once (0.1%).

## Playing

* **Windows build:** run `HavenCheckpoint.exe` from the `HavenCheckpoint-win32-x64` folder (see *Building* below,
  or download the artifact from the *Build Windows* GitHub Action).
* **From source:** `npm install` then `npm start` (Electron), or `npm run serve` and open
  `http://localhost:8080/src/index.html` in Chrome/Edge.

Start a **New Game** and play the tutorial (skippable) — it walks through one full visitor.

### Controls

| Key | Action |
| --- | --- |
| `W A S D`, mouse | move / look (`Shift` run, `Ctrl`/`C` crouch) |
| Right mouse (hold) | zoom for close inspection |
| `E` / left click | interact |
| `1`–`5` | hands, flashlight, UV lamp, Geiger counter, hose |
| Left mouse (hose) | spray water |
| `R` / `T` | ask the visitor to raise arms / turn around |
| `C` | view the visitor's ID card |
| `Tab` | procedures manual |
| `Esc` | pause / close panel, `F11` fullscreen |

### The stations

1. **Booth** – the visitor pushes an ID card through the slot. Compare the (pre-collapse) portrait,
   name, date of birth, height (height chart behind them), eye colour and sex. Ask questions on the
   intercom. Check the hidden **UV security seal**. Stamp *APPROVED* or *FLAG*, press *DECON*.
2. **Clothing** – inspect each garment as worn (visible slime/mould, oily chemical stains, lice; UV-only
   biological residue; radioactive items found only with the Geiger counter). Search pockets
   (confiscate weapons and unknown substances, return harmless belongings). Remove items one at a
   time (shoes before socks; underwear stays on) and carry them to the **washer** or the
   **incinerator**.
3. **Hose** – wash off dirt, grime and blood. Water wets skin (with run-off), makes light underwear
   semi-sheer and dark underwear darker, and weighs down hair physics. Some visitors hide discoloured
   skin under make-up that only washes off with enough water.
4. **Body inspection** – discoloured sclera, discoloured skin, bite marks (glow under UV), radiation
   burns / readings. Cuts, bruises and tattoos are harmless decoys.
5. **Return clothes** (minus burned items) and decide at the **Disposition Terminal**:
   admit, cure tanks (infected/irradiated – check the tanks in the lab every day until cured),
   interrogation (false identities – review the record, then admit or deny), or deny entry
   (only for those found dangerous).

Your decisions are reviewed at the end of each shift. The game saves at the end of each day.

## Adding your own VRoid models

Open **Model Workshop** from the main menu and click **Import .vrm…**. For every model you can:

* toggle the visibility of each texture/material and assign its role (body skin, face, hair, eyes,
  clothing…) and colour slot;
* see every clothing **piece** (connected mesh part) with its own visibility toggle, group pieces into
  **items** (e.g. a boot made of several parts, both shoes as one item), set the item's category
  (top, jacket, bottoms, dress, socks, shoes, gloves, hat, accessory, built-in underwear mesh,
  non-removable) and whether it can hide items;
* choose which colour slot each piece/item takes (cloth A–D, skin, hair, eye, random dark/light,
  or keep the texture colour);
* pick a **fabric** for each item or piece: soft cloth, knit, denim, silk/satin, sheer (see-through),
  leather, latex/vinyl, rubber, plastic or metal;
* edit **expressions**: choose which face blend shapes each VRM expression (happy, angry, sad,
  relaxed, surprised, blink, mouth shapes, custom ones) drives and at what weight, with live preview;
* set body type (female/male underwear rules), age group, and the built-in underwear removal
  sensitivity; preview random looks, poses and expressions.

Imported models and settings are stored in the app's user data folder
(`%APPDATA%/haven-checkpoint` on Windows). `assets/test-models/MiraiCitizen.vrm` is a sample model for
testing the importer (its dress is made of two materials that the workshop groups into one item).

## Underwear & prints

Bottoms (`assets/underwear/bottoms`), bras (`assets/underwear/bras`) and prints
(`assets/underwear/prints`) are 2048px textures mapped to the VRoid body UVs. The model's painted-on
underwear is erased (pixels inside the union of all underwear shapes that differ from the skin are
filled from the surrounding skin) and replaced with:

* **male:** mostly boyshorts / hipsters / briefs, no bra, 1% print chance;
* **female:** any bottoms and bras, 20% print chance, 70% matching sets.

Textures with "Black" in the name are recoloured (shading preserved); floral ones keep their colours.
Prints are grayscale masks: only the white areas take the print colour, and they are clipped to the
underwear's alpha so they never bleed onto skin. After adding textures, regenerate the manifest:
`python3 tools/build-underwear-manifest.py assets/underwear`.

## Building the Windows .exe

```
npm install
npm run package:win
```

Produces `dist/HavenCheckpoint-win32-x64/HavenCheckpoint.exe` (works from Windows, macOS or Linux). Add
`-- --zip` to also create a zip. The *Build Windows* GitHub Action does the same on every push and
uploads the folder as an artifact.

## Tech

Electron + three.js + [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) (VRM loading, expressions,
spring-bone hair) + three-mesh-bvh. VRoid's toon (MToon) materials are converted to physically based
materials with custom shader layers for dirt/blood/make-up/wetness, underwear compositing,
conditions, clothing contamination and UV fluorescence. All dirt, marks and stains are painted in 3D
and rasterised into UV textures, so they are seamless across UV islands. Libraries are vendored in
`src/vendor` (run `node tools/vendor.js` after updating them).
