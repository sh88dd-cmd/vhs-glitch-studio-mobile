#!/usr/bin/env python3
"""Create shared PHOTO VHS / VHS Video Lab catalogue from a pinned EmulsionPresets ZIP.

The release ZIP is byte-for-byte identical to the one provided by the owner.
This script runs only during GitHub Actions bundling, NOT on visitor devices.
All required data is later served as a local same-origin JSON file.
"""
import hashlib
import json
import pathlib
import sys
import zipfile
import xml.etree.ElementTree as ET

EXPECTED_SHA256 = "6dc2e63c64fe9893d780bd9d5ee5cf8926d8b671ce9a4fe0b61ed94f16c583f5"
CRS = "{http://ns.adobe.com/camera-raw-settings/1.0/}"
NS = {"crs": "http://ns.adobe.com/camera-raw-settings/1.0/",
      "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#"}

def build(zip_path, destination):
    src = pathlib.Path(zip_path)
    digest = hashlib.sha256(src.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError(f"Untrusted release ZIP sha256: {digest}")
    records = []
    seen = set()
    with zipfile.ZipFile(src) as archive:
        for item in archive.infolist():
            if item.is_dir() or not item.filename.lower().endswith(".xmp"):
                continue
            root = ET.fromstring(archive.read(item))
            desc = root.find(".//rdf:Description", NS)
            if desc is None:
                raise ValueError(f"Missing main rdf:Description in {item.filename}")
            fields = {key[len(CRS):]: value for key, value in desc.attrib.items()
                      if key.startswith(CRS)}
            uuid = fields.get("UUID")
            if not uuid:
                raise ValueError(f"Preset missing UUID: {item.filename}")
            preset_id = "xmp:" + uuid
            if preset_id in seen:
                raise ValueError(f"Duplicate XMP UUID: {preset_id}")
            seen.add(preset_id)
            name = fields.get("Name", pathlib.PurePosixPath(item.filename).stem).strip()[:95]
            group = desc.find("crs:Group", NS)
            category = "EmulsionPresets"
            if group is not None:
                label = group.find(".//rdf:li", NS)
                if label is not None and label.text:
                    category = label.text.strip()[:60]
            curve_nodes = desc.find("crs:ToneCurvePV2012", NS)
            curve = []
            if curve_nodes is not None:
                for point in curve_nodes.findall(".//rdf:li", NS):
                    try:
                        pair = [float(x.strip()) for x in (point.text or "").split(",")]
                        if len(pair) == 2:
                            curve.append(pair)
                    except ValueError:
                        continue
            # Keep actual grading fields; omit only Lightroom capability/identity headers.
            unused = {"UUID", "PresetType", "Cluster", "Name", "ProcessVersion",
                      "HasSettings", "SupportsAmount", "SupportsColor", "SupportsMonochrome",
                      "SupportsHighDynamicRange", "SupportsNormalDynamicRange",
                      "SupportsSceneReferred", "SupportsOutputReferred",
                      "RequiresRenditionBehavior"}
            grade_fields = {k: v for k, v in fields.items() if k not in unused}
            records.append({"id": preset_id, "name": name, "category": category,
                            "fields": grade_fields, "curve": curve if len(curve)>1 else None})
    if len(records) != 451 or len(seen) != 451:
        raise ValueError(f"Wrong library size {len(records)} (expected 451)")
    records.sort(key=lambda item: (item["category"], item["name"]))
    output = {"source": "peva3/EmulsionPresets", "release": "v3.1.4",
              "license": "MIT", "count": 451, "presets": records}
    dest = pathlib.Path(destination)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"Bundled {len(records)} XMP presets into {dest}: {dest.stat().st_size} bytes")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: bundle-emulsion-presets.py release.zip output.json")
    build(sys.argv[1], sys.argv[2])
