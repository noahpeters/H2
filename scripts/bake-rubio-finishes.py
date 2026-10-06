"""Rebuild finish albedos offline: python3 scripts/bake-rubio-finishes.py.

Requires Pillow 12.3.0 and numpy 2.3.5. The checked-in transfer curves were
sampled from the central 90% of the exact, hashed Rubio reference photographs.
Only color statistics are retained; none of the reference grain is copied.
Source coordinates, pixel resolution, physical scale and all relief maps stay
unchanged. Monotone OKLab lightness transfer preserves fine grain while matching
light/dark tones independently (including pale Natural and White finishes).
These are photographic preview matches, not measured coating/albedo data.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/studio/materials'
OUTPUT = ASSETS / 'rubio-oil-plus-2c'
manifest_path = OUTPUT / 'provenance.json'
manifest = json.loads(manifest_path.read_text())
M1=np.array([[.4122214708,.5363325363,.0514459929],[.2119034982,.6806995451,.1073969566],[.0883024619,.2817188376,.6299787005]])
M2=np.array([[.2104542553,.7936177850,-.0040720468],[1.9779984951,-2.4285922050,.4505937099],[.0259040371,.7827717662,-.8086757660]])
def to_lab(rgb):
 linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
 return np.cbrt(linear@M1.T)@M2.T

def to_rgb(lab):
 linear=((lab@np.linalg.inv(M2).T)**3)@np.linalg.inv(M1).T
 return np.where(linear<=.0031308,linear*12.92,1.055*np.maximum(linear,0)**(1/2.4)-.055)

colors = {}
for entry in manifest['entries']:
    source = ASSETS / entry['source']
    if hashlib.sha256(source.read_bytes()).hexdigest() != entry['sourceSha256']:
        raise ValueError(f"Source changed: {source}")
    for resolution in [1, 2]:
        source = ASSETS / entry['source'].replace('_1k.jpg', f'_{resolution}k.jpg')
        record = entry if resolution == 1 else entry.setdefault('detail', {})
        record['filename'] = entry['filename'] if resolution == 1 else entry['filename'].replace('.jpg', '-2k.jpg')
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        if record.get('sourceSha256', source_hash) != source_hash:
            raise ValueError(f'Detail source changed: {source}')
        record['sourceSha256'] = source_hash
        pixels = np.asarray(Image.open(source).convert('RGB'), dtype=np.float64) / 255
        lab = to_lab(pixels)
        result = np.empty_like(lab)
        lightness = lab[..., 0]
        result[..., 0] = np.interp(lightness, entry['sourceCurve'][0], entry['targetCurve'][0])
        for channel in [1, 2]:
            source_chroma = np.interp(lightness, entry['sourceCurve'][0], entry['sourceCurve'][channel])
            target_chroma = np.interp(lightness, entry['sourceCurve'][0], entry['targetCurve'][channel])
            result[..., channel] = target_chroma + 0.2 * (lab[..., channel] - source_chroma)
        result = to_rgb(result)
        output = OUTPUT / (entry['filename'] if resolution == 1 else entry['filename'].replace('.jpg', '-2k.jpg'))
        Image.fromarray(np.rint(np.clip(result, 0, 1) * 255).astype('uint8')).save(
            output, quality=95, subsampling=0, optimize=False)
        record['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
        record['bytes'] = output.stat().st_size
        record['resolution'] = list(Image.open(output).size)
    colors.setdefault(entry['material'], {})[entry['finish']] = {
        'color': entry['color'], 'referenceSpecies': entry['referenceSpecies'],
        'referenceUrl': entry['referenceUrl']}
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
(ROOT / 'app/studio/cabinet-configurator/rubioFinishColors.json').write_text(
    json.dumps(colors, indent=2) + '\n')
print(f"Baked {len(manifest['entries'])} finish textures")
