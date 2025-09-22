from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Dict, List

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
INPUT_XLSX = BASE_DIR / "data" / "Final List-23.09.2025.xlsx"
OUTPUT_JSON = BASE_DIR / "data.json"

SCORE_MAP: Dict[str, int] = {"high": 3, "medium": 2, "low": 1}
CATEGORY_KEYWORDS = [
    ("Beverages & Processed Foods", [
        "juice",
        "squash",
        "wine",
        "jam",
        "jelly",
        "pickle",
        "candy",
        "chutney",
        "powder",
        "tea",
        "coffee",
        "snack",
        "sherbet",
        "churan",
    ]),
    ("Extracts & Oils", [
        "oil",
        "attar",
        "distill",
        "extract",
        "resin",
    ]),
    ("Medicinal & Wellness", [
        "medicine",
        "herbal",
        "supplement",
        "tonic",
        "tea",
        "remedy",
        "capsule",
    ]),
    ("Food Ingredients", [
        "flour",
        "grain",
        "millet",
        "cereal",
        "kernel",
        "seed",
    ]),
    ("Fiber & Materials", [
        "wood",
        "timber",
        "fiber",
        "straw",
        "shell",
        "pod",
    ]),
]

PART_LOOKUP = {
    "bark": "Bark",
    "flower": "Flower",
    "fruit": "Fruit",
    "grain": "Grain",
    "grains": "Grain",
    "leaf": "Leaf",
    "leaves": "Leaf",
    "nut": "Nut & Kernel",
    "kernel": "Nut & Kernel",
    "nut kernel": "Nut & Kernel",
    "peel": "Peel & Pomace",
    "pomace": "Peel & Pomace",
    "pod": "Pod",
    "resin": "Resin & Gum",
    "gum": "Resin & Gum",
    "root": "Root & Rhizome",
    "rhizome": "Root & Rhizome",
    "root rhizome": "Root & Rhizome",
    "seed": "Seed",
    "shell": "Shell",
    "shoot": "Stem & Shoot",
    "stem": "Stem & Shoot",
    "stem shoot": "Stem & Shoot",
    "straw": "Straw",
    "thallus": "Whole Thallus",
    "wood": "Wood & Timber",
    "timber": "Wood & Timber",
}

PART_ORDER = [
    "Bark",
    "Flower",
    "Leaf",
    "Fruit",
    "Seed",
    "Root & Rhizome",
    "Stem & Shoot",
    "Wood & Timber",
    "Nut & Kernel",
    "Resin & Gum",
    "Grain",
    "Straw",
    "Pod",
    "Peel & Pomace",
    "Shell",
    "Whole Thallus",
]


def to_ascii(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_text.strip().split())


def normalize_token(token: str) -> str:
    ascii_token = to_ascii(token).lower()
    ascii_token = ascii_token.replace("-", " ")
    ascii_token = re.sub(r"[^a-z ]+", " ", ascii_token)
    return re.sub(r"\s+", " ", ascii_token).strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower())
    return slug.strip("-")


def split_by_comma(raw: str) -> List[str]:
    if not raw:
        return []
    items = [to_ascii(part) for part in raw.split(",")]
    return [item for item in (item.strip() for item in items) if item]


def parse_products(raw: str) -> List[str]:
    return split_by_comma(raw)


def parse_districts(raw: str) -> List[str]:
    districts = split_by_comma(raw)
    return sorted({district.title() for district in districts if district})


def parse_parts(raw: str) -> List[str]:
    if not raw:
        return []
    tokens = re.split(r",|/|;|\band\b", raw, flags=re.IGNORECASE)
    canonical = set()
    for token in tokens:
        cleaned = normalize_token(token)
        if not cleaned:
            continue
        canonical.add(PART_LOOKUP.get(cleaned, cleaned.title()))
    filtered = [part for part in canonical if part]
    return sorted(filtered, key=lambda part: (PART_ORDER.index(part) if part in PART_ORDER else len(PART_ORDER), part))


def determine_linkage(volume: str, commercial: str) -> str:
    vol_score = SCORE_MAP.get(volume.lower(), 2)
    val_score = SCORE_MAP.get(commercial.lower(), 2)
    if vol_score >= 3 and val_score >= 3:
        return "Integrated"
    if vol_score < val_score:
        return "Backward"
    if val_score < vol_score:
        return "Forward"
    return "Integrated"


def determine_species_type(category: str) -> str:
    category_lower = category.lower()
    if "agro" in category_lower:
        return "Agro-commodity"
    return "NTFP"


def determine_product_focus(products: List[str]) -> str:
    joined = " ".join(product.lower() for product in products)
    for label, keywords in CATEGORY_KEYWORDS:
        if any(keyword in joined for keyword in keywords):
            return label
    return "Other Value Chain"


def human_join(items: List[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f" and {items[-1]}"


def build_strength(name: str, species_type: str, volume: str, commercial: str, districts: List[str]) -> str:
    descriptors: List[str] = []
    if volume:
        descriptors.append(f"{volume.lower()} volume potential")
    if commercial:
        descriptors.append(f"{commercial.lower()} commercial value")
    base = f"{name} ({species_type})"
    if descriptors:
        base += f" shows {' and '.join(descriptors)}"
    if districts:
        base += f" across {human_join(districts)}"
    return base + "."


def build_justification(linkage: str, products: List[str], parts: List[str]) -> str:
    linkage_note = {
        "Backward": "Strengthen cultivation, nurseries, and aggregation systems to stabilise supply.",
        "Forward": "Invest in processing, packaging, and market development to capture premiums.",
        "Integrated": "Coordinate both production and market-side interventions for balanced growth.",
    }[linkage]
    return linkage_note


def clean_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    return to_ascii(str(value))


def load_rows() -> List[Dict[str, str]]:
    if not INPUT_XLSX.exists():
        raise FileNotFoundError(f"Excel file not found at {INPUT_XLSX}")
    df = pd.read_excel(INPUT_XLSX)
    records: List[Dict[str, str]] = []
    for _, row in df.iterrows():
        cleaned = {column: clean_cell(row[column]) for column in df.columns}
        records.append(cleaned)
    return records


def transform() -> Dict[str, object]:
    source_rows = load_rows()
    species: List[Dict[str, object]] = []

    district_counter: Counter[str] = Counter()
    linkage_counter: Counter[str] = Counter()
    species_type_counter: Counter[str] = Counter()
    habitat_counter: Counter[str] = Counter()
    parts_counter: Counter[str] = Counter()

    for row in source_rows:
        name = row.get("Common Name") or row.get("Scientific Name") or "Unnamed Commodity"
        botanical = row.get("Scientific Name") or ""
        category = row.get("CATEGORY") or "NTFP"
        species_type = determine_species_type(category)
        habitat = row.get("HABITAT") or ""
        conservation = row.get("Conservation Status") or ""
        volume = row.get("Volume") or "Medium"
        commercial = row.get("Commercial Value") or "Medium"
        districts = parse_districts(row.get("Districts") or "")
        products = parse_products(row.get("Products") or "")
        parts_used = parse_parts(row.get("Plant Parts Used") or "")
        linkage = determine_linkage(volume, commercial)
        product_focus = determine_product_focus(products)
        strength = build_strength(name, species_type, volume, commercial, districts)
        justification = build_justification(linkage, products, parts_used)
        slug = slugify(name or botanical or "species")
        image_path = f"images/{slug}.jpg"

        for district in districts:
            district_counter[district] += 1
        linkage_counter[linkage] += 1
        species_type_counter[species_type] += 1
        if habitat:
            habitat_counter[habitat] += 1
        for part in parts_used:
            parts_counter[part] += 1

        species.append(
            {
                "name": name,
                "botanical": botanical,
                "image": image_path,
                "speciesType": species_type,
                "habitat": habitat,
                "conservation": conservation,
                "districts": districts,
                "partsUsed": parts_used,
                "products": products,
                "productFocus": product_focus,
                "linkage": linkage,
                "volume": volume,
                "commercialValue": commercial,
                "strength": strength,
                "justification": justification,
            }
        )

    top_districts = ", ".join(f"{district} ({count})" for district, count in district_counter.most_common(5))
    top_parts = ", ".join(f"{part.lower()} ({count})" for part, count in parts_counter.most_common(4))
    ntfp_share = species_type_counter.get("NTFP", 0)
    agro_share = species_type_counter.get("Agro-commodity", 0)
    forward_focus = linkage_counter.get("Forward", 0)
    integrated_focus = linkage_counter.get("Integrated", 0)

    recommendations = [
        {
            "title": "For Community Enterprises",
            "content": (
                "<ul class=\"list-disc list-inside space-y-2 text-slate-600\">"
                f"<li><strong>Build layered commodity clusters:</strong> Anchor operations in lead districts such as {top_districts} so harvest windows, aggregation points, and compliance support are synchronised across villages.</li>"
                f"<li><strong>Upgrade primary handling around priority parts:</strong> Channel working capital into micro-drying, sorting, and moisture control units focused on {top_parts}, cutting losses and protecting quality premiums.</li>"
                "<li><strong>Design community working-capital cushions:</strong> Blend SHG savings, CSR infusions, and credit guarantees to underwrite harvest advances, enabling members to negotiate confidently with large buyers.</li>"
                "<li><strong>Institutionalise real-time market intelligence:</strong> Nominate marketing stewards to track prices, buyer specs, and compliance shifts so field plans can be adjusted before the season peaks.</li>"
                "</ul>"
            ),
        },
        {
            "title": "For Entrepreneurs",
            "content": (
                "<ul class=\"list-disc list-inside space-y-2 text-slate-600\">"
                f"<li><strong>Craft differentiated product portfolios:</strong> Translate the mix of {ntfp_share} NTFPs and {agro_share} agro-commodities into distinct wellness, gourmet, and regenerative product lines with clear market narratives.</li>"
                f"<li><strong>Invest in value-chain depth:</strong> {forward_focus + integrated_focus} commodities need forward or integrated support—pair extraction units, cold-press facilities, and packaging lines with long-term raw-material contracts.</li>"
                "<li><strong>Embed traceability and sustainability:</strong> Capture batch-wise data on origin, plant parts, and conservation status to meet clean label, ESG, and export audit expectations.</li>"
                "<li><strong>Adopt omnichannel market access:</strong> Combine tourism retail, institutional buyers, and digital marketplaces so volumes can be shifted quickly when seasonal gluts occur.</li>"
                "</ul>"
            ),
        },
        {
            "title": "For Planners & Support Agencies",
            "content": (
                "<ul class=\"list-disc list-inside space-y-2 text-slate-600\">"
                f"<li><strong>Tailor policy support by habitat:</strong> With {len(habitat_counter)} habitat categories represented, extend differentiated extension packages, varietal demonstrations, and climate advisories.</li>"
                "<li><strong>Strengthen logistics and shared infrastructure:</strong> Budget for aggregation hubs, ambient storage, and digital quality labs so hill-based producers can service urban demand without distress sales.</li>"
                "<li><strong>Formalise inclusive financing:</strong> Expand interest subvention, risk-sharing facilities, and blended finance pipelines that reward outcome-based milestones like traceability or reduced wild harvest.</li>"
                "<li><strong>Institutionalise market development platforms:</strong> Convene annual buyer-seller forums, export readiness clinics, and branding accelerators that equip local enterprises to participate in premium value chains.</li>"
                "</ul>"
            ),
        },
    ]

    return {"species": species, "recommendations": recommendations}


def main() -> None:
    dataset = transform()
    with OUTPUT_JSON.open("w", encoding="utf-8") as handle:
        json.dump(dataset, handle, indent=2)
    print(f"Wrote {len(dataset['species'])} species records to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
