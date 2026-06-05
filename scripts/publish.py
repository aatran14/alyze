#!/usr/bin/env python3
"""Merge benchmark CSVs and publish index.html with embedded data."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
TEMPLATE = ROOT / "web" / "index.template.html"
OUTPUT = ROOT / "index.html"
INJECT_MARKER = "<!-- INJECT_DATA -->"


def merge_data_csv():
    daily = sorted(DATA_DIR.glob("2*.csv"))
    lines = ["benchmark,machine,throughput_mibs,timestamp,commit"]
    for path in daily:
        text = path.read_text().strip()
        if not text:
            continue
        lines.extend(text.splitlines())
    (DATA_DIR / "data.csv").write_text("\n".join(lines) + "\n")


def parse_rows():
    rows = []
    with (DATA_DIR / "data.csv").open(newline="") as f:
        for row in csv.DictReader(f):
            throughput = float(row["throughput_mibs"])
            rows.append(
                {
                    "bench": row["benchmark"],
                    "machine": row["machine"],
                    "throughput": throughput,
                    "ts": row.get("timestamp") or "",
                    "commit": row.get("commit") or "",
                }
            )
    return rows


def inject_data(html: str, rows: list) -> str:
    payload = json.dumps({"rows": rows}, separators=(",", ":"))
    script = f'<script>window.__ALYZE_DATA__={payload};</script>'
    if INJECT_MARKER not in html:
        raise SystemExit(f"Missing {INJECT_MARKER} in {TEMPLATE}")
    return html.replace(INJECT_MARKER, script)


def main():
    if not TEMPLATE.is_file():
        raise SystemExit(f"Missing template: {TEMPLATE}")

    merge_data_csv()
    rows = parse_rows()
    html = TEMPLATE.read_text()
    OUTPUT.write_text(inject_data(html, rows))
    print(f"Published {OUTPUT} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
