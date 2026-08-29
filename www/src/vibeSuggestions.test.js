import { describe, expect, it } from "vitest";
import { buildCandidates, looksFor, VIBE_LOOKS } from "./vibeSuggestions";
import { FILL_COLORS, parseFillStyle } from "./fillTreatments";

const VALID_COVERAGES = ["full", "half", "bigSmall"];
const VALID_SIDES = ["first", "second"];
const VALID_FILL_SHAPES = ["solid", "gradient", "dots", "radial", "stripes", "lines"];

const ALL_VIBES = [
  "beach",
  "mountain",
  "water",
  "architecture",
  "winter",
  "food",
  "pet",
];

describe("buildCandidates", () => {
  it("orders every matched vibe's top look before any other look", () => {
    const matches = [
      { vibe: "beach", confidence: 0.7 },
      { vibe: "pet", confidence: 0.3 },
    ];
    const candidates = buildCandidates(matches);
    const beachLooks = looksFor("beach");
    const petLooks = looksFor("pet");

    expect(candidates.length).toBe(beachLooks.length + petLooks.length);
    expect(candidates[0]).toMatchObject({
      vibe: "beach",
      filter: beachLooks[0].filter,
      sticker: beachLooks[0].sticker,
    });
    expect(candidates[1]).toMatchObject({
      vibe: "pet",
      filter: petLooks[0].filter,
      sticker: petLooks[0].sticker,
    });
  });

  it("carries the matched confidence onto every look from that vibe", () => {
    const candidates = buildCandidates([{ vibe: "water", confidence: 0.42 }]);
    expect(candidates.every((c) => c.confidence === 0.42)).toBe(true);
  });

  it("returns an empty list for no matches", () => {
    expect(buildCandidates([])).toEqual([]);
  });

  it("skips an unrecognized vibe name rather than throwing", () => {
    expect(buildCandidates([{ vibe: "nonexistent", confidence: 0.9 }])).toEqual(
      [],
    );
  });

  it("folds a real exposure/contrast/saturation nudge into every candidate when the photo tone calls for one", () => {
    // brightness 0.2 is well under toneAdjustments' 0.35 brighten floor.
    const candidates = buildCandidates([{ vibe: "pet", confidence: 0.5 }], {
      brightness: 0.2,
      contrast: 0.5,
      saturation: 0.5,
    });
    expect(
      candidates.every((c) => c.adjustments && c.adjustments.brightness > 0),
    ).toBe(true);
  });

  it("carries no adjustments when the photo tone is already balanced", () => {
    const candidates = buildCandidates([{ vibe: "pet", confidence: 0.5 }], {
      brightness: 0.5,
      contrast: 0.5,
      saturation: 0.5,
    });
    expect(candidates.every((c) => c.adjustments === null)).toBe(true);
  });
});

describe("buildCandidates with a tone signal", () => {
  it("promotes a moodier look to primary for an already bright, saturated photo", () => {
    // beach's default primary is vintage -- for a photo already bright
    // and colorful, grayscale should win instead (see scoreForTone).
    const candidates = buildCandidates([{ vibe: "beach", confidence: 0.8 }], {
      brightness: 0.9,
      saturation: 0.5,
    });
    expect(candidates[0].filter).toBe("grayscale");
  });

  it("promotes sepia to primary for a dim, muted photo", () => {
    const candidates = buildCandidates([{ vibe: "beach", confidence: 0.8 }], {
      brightness: 0.2,
      saturation: 0.1,
    });
    expect(candidates[0].filter).toBe("sepia");
  });

  it("still lists every look from the vibe, just reordered", () => {
    const withoutTone = buildCandidates([{ vibe: "beach", confidence: 0.8 }]);
    const withTone = buildCandidates([{ vibe: "beach", confidence: 0.8 }], {
      brightness: 0.9,
      saturation: 0.5,
    });
    const combosOf = (list) =>
      list.map((c) => `${c.filter}:${c.sticker}`).sort();
    expect(combosOf(withTone)).toEqual(combosOf(withoutTone));
  });

  it("falls back to the curated order when tone is null", () => {
    const candidates = buildCandidates(
      [{ vibe: "beach", confidence: 0.8 }],
      null,
    );
    expect(candidates[0].filter).toBe("vintage");
  });
});

describe("looksFor", () => {
  it("returns a large, distinct pool for every known vibe", () => {
    for (const vibe of ALL_VIBES) {
      const looks = looksFor(vibe);
      expect(looks.length).toBeGreaterThanOrEqual(16);
      const combos = new Set(looks.map((l) => `${l.filter}:${l.sticker}`));
      expect(combos.size).toBe(looks.length);
    }
  });

  it("returns an empty array for an unknown vibe", () => {
    expect(looksFor("nonexistent")).toEqual([]);
  });

  it("gives every look a vibe/filter/sticker label key and an opener + closer key to compose its sentence from", () => {
    for (const look of looksFor("beach")) {
      expect(look.vibeLabelKey).toBe("vibe.label.beach");
      expect(look.filterLabelKey).toBe(`editor.filter.${look.filter}`);
      expect(look.stickerLabelKey).toBe(
        look.sticker ? `stickers.${look.sticker}` : null,
      );
      expect(look.openerKey).toMatch(/^vibe\.opener\.\d$/);
      expect(look.closerKey).toMatch(
        look.sticker
          ? /^vibe\.closer\.withSticker\.\d$/
          : /^vibe\.closer\.noSticker\.\d$/,
      );
    }
  });

  it("gives every look the vibe's own curated font choice, auto text color, and a valid layout/fill", () => {
    for (const vibe of ALL_VIBES) {
      for (const look of looksFor(vibe)) {
        expect(look.fontChoice).toBe(VIBE_LOOKS[vibe].fontChoice);
        expect(look.textColor).toBe("auto");
        expect([1, 1.3]).toContain(look.fontScale);
        expect(VALID_COVERAGES).toContain(look.photoCoverage);
        expect(VALID_SIDES).toContain(look.photoSide);
        const { shape } = parseFillStyle(look.fillStyle);
        expect(VALID_FILL_SHAPES).toContain(shape);
        expect(look.fillColor === "auto" || FILL_COLORS.includes(look.fillColor)).toBe(true);
      }
    }
  });

  it("suggests a split layout only sometimes, not on every look", () => {
    // Mostly full-bleed is the whole point (see the module's own comment
    // on LAYOUT_VARIETY_STRIDE) -- assert both that split looks exist at
    // all, and that they're a minority.
    const allLooks = ALL_VIBES.flatMap((vibe) => looksFor(vibe));
    const splitLooks = allLooks.filter((l) => l.photoCoverage !== "full");
    expect(splitLooks.length).toBeGreaterThan(0);
    expect(splitLooks.length).toBeLessThan(allLooks.length / 2);
  });
});

describe("the overall look repertoire", () => {
  it("offers at least 100 distinct filter/sticker look varieties across all vibes", () => {
    const total = ALL_VIBES.reduce(
      (sum, vibe) => sum + looksFor(vibe).length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(100);
  });

  it("never repeats a filter or a sticker within one vibe's own curated lists", () => {
    for (const vibe of ALL_VIBES) {
      const { filters, stickers } = VIBE_LOOKS[vibe];
      expect(new Set(filters).size).toBe(filters.length);
      expect(new Set(stickers).size).toBe(stickers.length);
    }
  });
});
