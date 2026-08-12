"""Regenerate site/public/charts/rules-comparison.png and rules-treemap.png.

Style, figure size and dpi are carried over from the script that produced the
originals (21x12 at dpi 100 -> 2100x1200).

Rule counts verified 2026-08-11 against `migrationpilot list-rules --json`:
  MigrationPilot   112 rules (MP001-MP112)
  Squawk            40 rules (v2.62.0, Aug 2026)
  Atlas (free)       0 -- migrate lint removed from Community Edition entirely
Atlas (paid) / strong_migrations / Eugene keep their prior values (not re-verified).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import squarify

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "site" / "public" / "charts"

BG = "#000000"
BLUE = "#2b6cd4"
GREY = "#4d5666"
TEXT = "#ffffff"
MUTED = "#9aa3af"


def load_rules():
    """The rule set, straight from the engine — never a copy kept in this file."""
    out = subprocess.run(
        ["npx", "tsx", "src/cli.ts", "list-rules", "--json"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        shell=(os.name == "nt"),
    )
    if out.returncode != 0:
        raise SystemExit(f"list-rules failed:\n{out.stderr.strip()}")
    return json.loads(out.stdout)


ALL_RULES = load_rules()
ALL_IDS = [r["id"] for r in ALL_RULES]
TOTAL = len(ALL_IDS)

# ─────────────────────────── comparison bar chart ───────────────────────────

TOOLS = [
    ("MigrationPilot", TOTAL, True),
    ("Squawk", 40, False),
    ("Atlas (free)", 0, False),
    ("Atlas (paid)", 15, False),
    ("strong_migrations", 18, False),
    ("Eugene", 12, False),
]

fig, ax = plt.subplots(figsize=(21, 12), dpi=100)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

labels = [t[0] for t in TOOLS]
values = [t[1] for t in TOOLS]
colors = [BLUE if t[2] else GREY for t in TOOLS]

ypos = range(len(TOOLS))
bars = ax.barh(list(ypos), values, color=colors, height=0.62)
ax.invert_yaxis()

for bar, value in zip(bars, values):
    ax.text(
        bar.get_width() + 1.1,
        bar.get_y() + bar.get_height() / 2,
        str(value),
        va="center",
        ha="left",
        color=MUTED,
        fontsize=26,
    )

ax.set_title(
    "PostgreSQL Migration Linter Rules Comparison",
    color=TEXT,
    fontsize=42,
    fontweight="bold",
    loc="left",
    pad=36,
)
ax.set_xlabel("Number of Rules", color=TEXT, fontsize=28, labelpad=18)
ax.set_ylabel("Tool", color=TEXT, fontsize=28, labelpad=18)

ax.set_xlim(0, 124)
ax.set_yticks(list(ypos))
ax.set_yticklabels(labels, color=MUTED, fontsize=28)
ax.tick_params(axis="x", colors=MUTED, labelsize=26)
ax.tick_params(axis="y", length=0)

ax.grid(axis="x", color="#3a3a3a", linestyle="--", linewidth=1, alpha=0.7)
ax.set_axisbelow(True)
for side in ("top", "right", "bottom", "left"):
    ax.spines[side].set_visible(False)

fig.tight_layout()
comparison_out = str(OUT_DIR / "rules-comparison.png")
fig.savefig(comparison_out, facecolor=BG, edgecolor="none")
plt.close(fig)
print("wrote", comparison_out)

# ────────────────────────────── category treemap ─────────────────────────────
# Editorial grouping of every rule by what it protects. Every ID appears exactly
# once; the assertion below fails the build rather than shipping a chart whose
# parts do not add up to the rule set.

CATEGORIES = [
    (
        "Lock safety",
        "#1568c8",
        [
            "MP001",
            "MP003",
            "MP004",
            "MP006",
            "MP007",
            "MP008",
            "MP009",
            "MP020",
            "MP021",
            "MP025",
            "MP032",
            "MP033",
            "MP047",
            "MP053",
            "MP058",
            "MP063",
            "MP065",
            "MP069",
            "MP070",
            "MP076",
            "MP089",
            "MP090",
            "MP095",
            "MP096",
        ],
    ),
    (
        "Types & schema style",
        "#009e96",
        [
            "MP012",
            "MP015",
            "MP023",
            "MP037",
            "MP038",
            "MP039",
            "MP040",
            "MP041",
            "MP042",
            "MP048",
            "MP054",
            "MP056",
            "MP061",
            "MP062",
            "MP066",
            "MP068",
            "MP075",
            "MP077",
            "MP078",
        ],
    ),
    (
        "Data safety",
        "#c47a3f",
        [
            "MP010",
            "MP017",
            "MP022",
            "MP024",
            "MP026",
            "MP028",
            "MP029",
            "MP034",
            "MP035",
            "MP036",
            "MP044",
            "MP052",
            "MP055",
            "MP060",
            "MP064",
            "MP071",
            "MP097",
            "MP098",
        ],
    ),
    (
        "Constraints & keys",
        "#b06fd0",
        [
            "MP002",
            "MP005",
            "MP016",
            "MP018",
            "MP027",
            "MP030",
            "MP031",
            "MP043",
            "MP045",
            "MP074",
            "MP081",
            "MP082",
            "MP083",
            "MP084",
            "MP086",
            "MP087",
        ],
    ),
    (
        "Extensions",
        "#d05f7a",
        [
            "MP050",
            "MP051",
            "MP105",
            "MP106",
            "MP107",
            "MP108",
            "MP109",
            "MP111",
            "MP112",
        ],
    ),
    (
        "Production context",
        "#4b4bc8",
        [
            "MP013",
            "MP014",
            "MP019",
            "MP100",
            "MP101",
            "MP102",
            "MP103",
            "MP104",
        ],
    ),
    (
        "Partitioning",
        "#3f9e5a",
        [
            "MP046",
            "MP049",
            "MP072",
            "MP092",
            "MP093",
            "MP094",
            "MP110",
        ],
    ),
    (
        "Privileges & RLS",
        "#c8a33f",
        [
            "MP057",
            "MP073",
            "MP079",
            "MP085",
            "MP091",
            "MP099",
        ],
    ),
    (
        "Backfills & DML",
        "#5f8fd0",
        [
            "MP011",
            "MP059",
            "MP067",
            "MP080",
            "MP088",
        ],
    ),
]

assigned = [rid for _, _, ids in CATEGORIES for rid in ids]
missing = sorted(set(ALL_IDS) - set(assigned))
extra = sorted(set(assigned) - set(ALL_IDS))
dupes = sorted({r for r in assigned if assigned.count(r) > 1})
if missing or extra or dupes:
    print("CATEGORY MAP BROKEN")
    print("  unassigned:", missing)
    print("  not a real rule:", extra)
    print("  assigned twice:", dupes)
    sys.exit(1)
assert len(assigned) == TOTAL, f"{len(assigned)} != {TOTAL}"

CATEGORIES.sort(key=lambda c: len(c[2]), reverse=True)
sizes = [len(ids) for _, _, ids in CATEGORIES]
tile_colors = [color for _, color, _ in CATEGORIES]
tile_labels = [f"{name}\n{len(ids)}" for name, _, ids in CATEGORIES]

fig, ax = plt.subplots(figsize=(21, 12), dpi=100)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

WIDTH, HEIGHT = 100.0, 100.0
rects = squarify.squarify(
    squarify.normalize_sizes(sizes, WIDTH, HEIGHT), 0, 0, WIDTH, HEIGHT
)

# Rendered width of a string at fontsize 1, in points, for this font stack.
CHAR_W = 0.56
PT_PER_UNIT = (21 * 72) / WIDTH  # figure points per axis unit

for rect, (name, color, ids) in zip(rects, CATEGORIES):
    x, y, dx, dy = rect["x"], rect["y"], rect["dx"], rect["dy"]
    ax.add_patch(
        plt.Rectangle((x, y), dx, dy, facecolor=color, edgecolor="#ffffff", linewidth=2)
    )
    # Shrink the label until it fits the tile with a margin on both sides.
    usable_pt = (dx * 0.88) * PT_PER_UNIT
    fontsize = min(30, usable_pt / (len(name) * CHAR_W))
    ax.text(
        x + dx / 2,
        y + dy / 2,
        f"{name}\n{len(ids)}",
        ha="center",
        va="center",
        color="#101010",
        fontsize=fontsize,
        linespacing=1.4,
    )

ax.set_xlim(0, WIDTH)
ax.set_ylim(0, HEIGHT)
ax.invert_yaxis()

ax.set_title(
    f"MigrationPilot {TOTAL} Rules by Category",
    color=TEXT,
    fontsize=42,
    fontweight="bold",
    loc="left",
    pad=36,
)
ax.axis("off")

fig.tight_layout()
treemap_out = str(OUT_DIR / "rules-treemap.png")
fig.savefig(treemap_out, facecolor=BG, edgecolor="none")
plt.close(fig)
print("wrote", treemap_out)
print(
    "category totals:",
    {name: len(ids) for name, _, ids in CATEGORIES},
    "sum",
    sum(sizes),
)
