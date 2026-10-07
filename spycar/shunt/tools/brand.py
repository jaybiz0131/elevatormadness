# Builds the shipped brand files in assets/brand from the two masters (Stop 7 follow-up):
#   bern1_title_fire.png (1728 x 1152, black background) -> bern1_title_fire.jpg: the empty top and bottom trimmed, the empty right margin trimmed, the left edge kept
#       (the flame trail runs off the screen edge), 1170 px wide (3x of a 390 pt phone). The page draws it with mix-blend-mode: screen, so the black is the showroom showing through.
#   bern1_app_icon_1024.png -> apple-touch-icon-180.png (180 x 180). The 1024 master stays in the repo for the App Store.
#   python3 tools/brand.py
from PIL import Image
import numpy as np, os
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'assets', 'brand')
t = Image.open(os.path.join(here, 'bern1_title_fire.png')).convert('RGB'); a = np.asarray(t).max(axis=2); ys, xs = np.where(a > 12)
box = (0, max(0, ys.min() - 8), min(t.width, xs.max() + 12), min(t.height, ys.max() + 8)); c = t.crop(box); w = 1170; c = c.resize((w, round(c.height * w / c.width)), Image.LANCZOS)
c.save(os.path.join(here, 'bern1_title_fire.jpg'), 'JPEG', quality=86, optimize=True, subsampling=0); print('title', box, c.size, os.path.getsize(os.path.join(here, 'bern1_title_fire.jpg')), 'bytes')
i = Image.open(os.path.join(here, 'bern1_app_icon_1024.png')).convert('RGB').resize((180, 180), Image.LANCZOS); i.save(os.path.join(here, 'apple-touch-icon-180.png'), optimize=True); print('icon', os.path.getsize(os.path.join(here, 'apple-touch-icon-180.png')), 'bytes')
