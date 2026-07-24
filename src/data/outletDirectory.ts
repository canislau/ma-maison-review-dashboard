export interface OutletDirectoryEntry {
  code: string;
  name: string;
  brand: string;
  aliases: string[];
}

export const OUTLET_DIRECTORY: OutletDirectoryEntry[] = [
  { code: "MM001", name: "One Utama", brand: "Ma Maison Tonkatsu", aliases: ["1 utama", "1u", "one utama shopping centre", "tonkatsu by ma maison 1 utama shopping centre"] },
  { code: "MM002", name: "Publika", brand: "Ma Maison Tonkatsu", aliases: ["publika shopping gallery", "tonkatsu by ma maison publika shopping gallery"] },
  { code: "MM003", name: "Main Place", brand: "Ma Maison Tonkatsu", aliases: ["main place mall", "tonkatsu by ma maison main place mall"] },
  { code: "MM004", name: "Lot 10", brand: "Ma Maison Tonkatsu", aliases: ["lot 10 shopping centre", "ma maison ebisu lot 10 shopping centre"] },
  { code: "MM005", name: "163", brand: "Ma Maison Tonkatsu", aliases: ["163 retail park", "sunway 163 mall", "tonkatsu by ma maison sunway 163 mall"] },
  { code: "MM006", name: "The Sphere", brand: "Ma Maison Tonkatsu", aliases: ["the sphere bangsar south", "tonkatsu by ma maison the sphere"] },
  { code: "MM007", name: "Sunway Pyramid", brand: "Ma Maison Tonkatsu", aliases: ["tonkatsu by ma maison sunway pyramid"] },
  { code: "MM008", name: "The Gardens", brand: "Ma Maison Tonkatsu", aliases: ["the gardens mall tonkatsu", "tonkatsu by ma maison the gardens mall"] },
  { code: "MM009", name: "Pavilion Bukit Jalil (PBJ)", brand: "Ma Maison Tonkatsu", aliases: ["pavilion bukit jalil", "pbj", "tonkatsu by ma maison pavilion bukit jalil"] },
  { code: "MM010", name: "Southkey Mid Valley (SKM)", brand: "Ma Maison Tonkatsu", aliases: ["southkey mid valley", "mid valley southkey", "skm", "the mall mid valley southkey", "tonkatsu by ma maison the mall mid valley southkey"] },
  { code: "MM011", name: "AEON Tebrau", brand: "Ma Maison Tonkatsu", aliases: ["aeon mall tebrau city", "tonkatsu by ma maison aeon mall tebrau city"] },
  { code: "MM012", name: "Sunway Velocity", brand: "Ma Maison Tonkatsu", aliases: ["sunway velocity tonkatsu", "tonkatsu by ma maison sunway velocity"] },
  { code: "KK001", name: "KLCC", brand: "Kyoto Katsu", aliases: ["suria klcc", "kyoto katsu klcc"] },
  { code: "KK002", name: "IOI City Mall", brand: "Kyoto Katsu", aliases: ["ioi city", "kyoto katsu ioi city mall"] },
  { code: "RT001", name: "Sunway Velocity", brand: "Ramen Takahashi", aliases: ["ramen takahashi sunway velocity", "ramen takahashi sunway velocity mall"] },
  { code: "GM001", name: "The Gardens Mall", brand: "Kintsugi", aliases: ["kintsugi the gardens", "kintsugi gardens", "kintsugi at the gardens"] },
  { code: "PSB001", name: "Damansara Heights", brand: "Ploy", aliases: ["ploy damansara heights"] },
];

export const BRANDS = Array.from(new Set(OUTLET_DIRECTORY.map((entry) => entry.brand)));

function normalise(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

const SHARED_OUTLET_NAMES = new Set(["the gardens mall", "the gardens", "sunway velocity", "sunway velocity mall"]);

export function isSharedOutletName(value: string): boolean {
  return SHARED_OUTLET_NAMES.has(normalise(value));
}

export function resolveOutletIdentity(input: {
  outlet?: string;
  brand?: string;
  outletCode?: string;
  reviewId?: string;
}): { brand: string; outletCode: string; outlet: string } {
  const code = (input.outletCode || "").trim().toUpperCase();
  const reviewCode = (input.reviewId || "").trim().toUpperCase().match(/^([A-Z]{2,3}\d{3})/)?.[1] || "";
  const brand = normalise(input.brand || "");
  const outlet = normalise(input.outlet || "");

  // This brand appears in historical CWX workbooks but no outlet code has
  // been supplied in the managed directory. Preserve the known brand/outlet
  // and leave the code blank rather than inventing one.
  if (outlet.includes("way modern chinois") && outlet.includes("1 utama")) {
    return { brand: "Way Modern Chinois", outletCode: "", outlet: "One Utama" };
  }

  if (!brand && !code && !reviewCode && isSharedOutletName(outlet)) {
    return { brand: "Unmapped", outletCode: "", outlet: input.outlet?.trim() || "" };
  }

  let match = OUTLET_DIRECTORY.find((entry) => entry.code === code);
  if (!match && reviewCode) match = OUTLET_DIRECTORY.find((entry) => entry.code === reviewCode);
  if (!match && outlet) {
    const candidates = OUTLET_DIRECTORY.filter((entry) => {
      const names = [entry.name, `${entry.brand} ${entry.name}`, ...entry.aliases].map(normalise);
      return names.some((name) => name === outlet || (name.length > 5 && outlet.includes(name)));
    });
    match = candidates.find((entry) => !brand || normalise(entry.brand) === brand);
    if (!match && candidates.length === 1) match = candidates[0];
  }

  return match
    ? { brand: match.brand, outletCode: match.code, outlet: match.name }
    : { brand: input.brand?.trim() || "Unmapped", outletCode: code, outlet: input.outlet?.trim() || "" };
}

export function outletsForBrand(brand?: string): OutletDirectoryEntry[] {
  return brand && brand !== "All" ? OUTLET_DIRECTORY.filter((entry) => entry.brand === brand) : OUTLET_DIRECTORY;
}
