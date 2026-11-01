"""Builds assets/underwear/manifest.json and region-mask.png.

Run with:  python3 -I tools/build-underwear-manifest.py assets/underwear
- manifest: per texture kind, bbox, whether it can be recoloured, and the
  luminance of its base colour (used to keep seams/lace shading on recolour).
- region-mask.png: union of every bottom/bra alpha (1024px), dilated, used to
  find and erase the underwear painted into a model's body texture.
"""
import sys, os, json
from PIL import Image, ImageFilter
import numpy as np

root = sys.argv[1]
out = {"bottoms": [], "bras": [], "prints": []}
union = np.zeros((1024, 1024), np.uint8)
for kind in ("bottoms", "bras", "prints"):
    for f in sorted(os.listdir(os.path.join(root, kind))):
        if not f.lower().endswith(".png"):
            continue
        im = Image.open(os.path.join(root, kind, f)).convert("RGBA")
        a = np.asarray(im)
        name = f[:-4]
        entry = {"file": f, "name": name}
        if kind != "prints":
            alpha = a[:, :, 3]
            ys, xs = np.nonzero(alpha > 8)
            entry["bbox"] = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
            op = a[alpha > 200][:, :3].astype(np.float32)
            lum = op @ np.array([0.299, 0.587, 0.114])
            hist = np.bincount(lum.astype(int), minlength=256)
            entry["baseLum"] = int(hist.argmax())
            sat = (op.max(1) - op.min(1)).mean()
            entry["recolor"] = bool(("Black" in name) and sat < 60)
            # display label: split CamelCase and drop the colour suffix
            label = name.replace("LegoBlack", "").replace("Black", "")
            for c in ("FloralPastelPink", "FloralPink", "FloralNude"):
                if label.endswith(c):
                    label = label[: -len(c)] + " (Floral)"
            entry["label"] = "".join(" " + ch if ch.isupper() else ch for ch in label).strip().replace("( ", "(")
            small = Image.fromarray(alpha).resize((1024, 1024), Image.BILINEAR)
            union = np.maximum(union, np.asarray(small))
        out[kind].append(entry)

mask = Image.fromarray(((union > 10) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
mask.save(os.path.join(root, "region-mask.png"))
json.dump(out, open(os.path.join(root, "manifest.json"), "w"), indent=1)
print(len(out["bottoms"]), len(out["bras"]), len(out["prints"]))
