"""Liest die selbst erzeugten QR-Matrizen mit einem echten Decoder.

Das ist die Pruefung, auf die es ankommt: Ein QR-Code muss von einem Scanner
gelesen werden - ob er Modul fuer Modul einer bestimmten Bibliothek gleicht,
ist zweitrangig.
"""
import json, subprocess, sys
import numpy as np
import cv2

BASIS = r'C:\Users\DenisFedorov\Downloads\Programming\umfrage1'

faelle = [
    ("https://umfrage.dihag.de/?u=newsletter-2026", "M"),
    ("https://umfrage.dihag.de/?u=newsletter-2026", "L"),
    ("https://umfrage.dihag.de/?u=intranet-2026", "M"),
    ("A", "M"),
    ("Gie\u00dferei B\u00fcro Jubil\u00e4en \u00c4\u00d6\u00dc", "M"),
    ("https://dfedorov12.github.io/umfrage1/?u=newsletter-2026", "M"),
    ("x" * 100, "M"),
    ("y" * 180, "M"),
    ("z" * 200, "L"),
]

js = r'''
const QR = require(process.argv[1] + "/js/qr.js");
const faelle = JSON.parse(process.argv[2]);
const out = faelle.map(([text, ecc]) => {
  const q = QR.erzeuge(text, { ecc });
  return { text, ecc, version: q.version, maske: q.maske, size: q.size,
           matrix: q.matrix.map(z => z.join("")) };
});
console.log(JSON.stringify(out));
'''

ergebnis = subprocess.run([r'node', '-e', js, BASIS, json.dumps(faelle)],
                          capture_output=True, text=True, encoding='utf-8')
if ergebnis.returncode:
    print(ergebnis.stderr)
    sys.exit(1)
codes = json.loads(ergebnis.stdout)

detector = cv2.QRCodeDetector()
fehler = 0
for c in codes:
    s = c["size"]
    rand = 4
    skala = 8
    gesamt = (s + 2 * rand) * skala
    bild = np.full((gesamt, gesamt), 255, dtype=np.uint8)
    for y in range(s):
        for x in range(s):
            if c["matrix"][y][x] == "1":
                y0 = (y + rand) * skala
                x0 = (x + rand) * skala
                bild[y0:y0 + skala, x0:x0 + skala] = 0
    gelesen, _, _ = detector.detectAndDecode(bild)
    ok = gelesen == c["text"]
    if not ok:
        fehler += 1
    kurz = c["text"][:40] + ("..." if len(c["text"]) > 40 else "")
    status = "ok  " if ok else "FEHL"
    print(f"  {status} {c['ecc']} V{c['version']:<2} Maske {c['maske']} {s}x{s}  {kurz}")
    if not ok:
        print(f"       gelesen: {gelesen[:60]!r}")

print()
print("Alle lesbar." if not fehler else f"{fehler} von {len(codes)} nicht lesbar.")
sys.exit(1 if fehler else 0)
