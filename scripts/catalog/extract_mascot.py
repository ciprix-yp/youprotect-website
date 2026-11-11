"""Extract source facts for selected MASCOT models from the dealer export (xlsx).

Usage:
  python -I scripts/catalog/extract_mascot.py <feed.xlsx> <out_dir> <model> [<model> ...]
         [--colours <orders.csv>]

- Prices/currency are deliberately NOT extracted (the repo is public).
- --colours: CSV exported from the MASCOT portal (Productnumber = model-quality-colour);
  only colours actually ordered are flagged `ordered: true`.
Output: one JSON per model in <out_dir>, with every value traceable to a feed column.
"""
import csv
import json
import sys
from collections import OrderedDict
from pathlib import Path

import openpyxl

MODEL_FIELDS = [
    "Brand", "Range", "Range Subnames", "Product Type", "Product Categories", "City Product Name",
    "Product type attributes", "Highligted info", "Technical text", "USP text", "Quality",
    "Quality remark", "Quality weight", "Washing Symbol Name", "Industrial care category",
    "Pictogram name", "Pictogram text", "Certification", "Certification image", "Technology name",
    "Industry name", "Segments", "Variant Woman-Man", "Remarks", "Product URL", "Product PDF", "DOC",
    "Youtube Code", "Related products", "Alternative products", "Logo placement", "Hi-vis logo area",
    "Fitting Accessories", "Product Accessories", "Country of origin",
]
COLOUR_FIELDS = ["Colour", "Colour Image Link", "Product Images 1000px", "Colour specific remark"]
SIZE_FIELDS = ["EU Size", "UK size", "US size", "Chest size", "Waist size", "Hip size", "Leg length",
               "Collar size", "Head size"]


def split_multi(value):
    return [p.strip() for p in str(value).split(";") if p.strip()]


def ordered_colours(path):
    out = {}
    if not path:
        return out
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            parts = (row.get("Productnumber") or "").split("-")
            if len(parts) >= 3:
                out.setdefault(parts[0], set()).add(parts[2])
    return out


def main(argv):
    colours_csv = None
    if "--colours" in argv:
        i = argv.index("--colours")
        colours_csv = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    feed, out_dir, models = argv[0], Path(argv[1]), set(argv[2:])
    out_dir.mkdir(parents=True, exist_ok=True)
    ordered = ordered_colours(colours_csv)

    wb = openpyxl.load_workbook(feed, read_only=True, data_only=True)
    rows = wb.worksheets[0].iter_rows(values_only=True)
    header = [str(h) if h is not None else "" for h in next(rows)]
    ix = {h: i for i, h in enumerate(header)}
    data = {}
    for r in rows:
        model = str(r[ix["Product Number"]] or "").strip()
        if model not in models:
            continue
        d = data.setdefault(model, {"model": model, "fields": OrderedDict(), "colours": OrderedDict(),
                                    "sizes": OrderedDict(), "qualities": set()})
        d["qualities"].add(str(r[ix["Quality Number"]] or ""))
        for f in MODEL_FIELDS:
            v = r[ix[f]]
            if v not in (None, ""):
                d["fields"].setdefault(f, [])
                if str(v) not in d["fields"][f]:
                    d["fields"][f].append(str(v))
        cnum = str(r[ix["Colour Number"]] or "")
        c = d["colours"].setdefault(cnum, {"number": cnum, "name": str(r[ix["Colour"]] or ""),
                                           "images_1000": [], "swatch": None, "remark": None,
                                           "ordered": cnum in ordered.get(model, set())})
        for url in split_multi(r[ix["Product Images 1000px"]] or ""):
            if url not in c["images_1000"]:
                c["images_1000"].append(url)
        c["swatch"] = c["swatch"] or (str(r[ix["Colour Image Link"]]) if r[ix["Colour Image Link"]] else None)
        c["remark"] = c["remark"] or (str(r[ix["Colour specific remark"]]) if r[ix["Colour specific remark"]] else None)
        eu = str(r[ix["EU Size"]] or "")
        if eu and eu not in d["sizes"]:
            d["sizes"][eu] = {f: str(r[ix[f]]) for f in SIZE_FIELDS if r[ix[f]] not in (None, "")}

    for model in sorted(models):
        if model not in data:
            print(f"!! {model}: not found in feed", file=sys.stderr)
            continue
        d = data[model]
        d["qualities"] = sorted(q for q in d["qualities"] if q)
        d["colours"] = list(d["colours"].values())
        d["sizes"] = list(d["sizes"].values())
        d["source"] = {"supplier": "MASCOT", "feed": Path(feed).name}
        (out_dir / f"{model}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
        n_ord = sum(1 for c in d["colours"] if c["ordered"])
        print(f"{model}: {len(d['colours'])} colours ({n_ord} ordered), {len(d['sizes'])} sizes, "
              f"{sum(len(c['images_1000']) for c in d['colours'])} images")


if __name__ == "__main__":
    main(sys.argv[1:])
