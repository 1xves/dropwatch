const normalizeComparable = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const PRICE_ONLY_ITEM_PATTERN = /^\$?\d+(\.\d+)?\s*(usd)?$/i;

const GENERIC_LABEL_PATTERN = /^(new\s+)?(drop|release|restock|announcement|coming\s+soon|out\s+now|available\s+now|pre[-\s]?order|sold\s+out|next\s+release\b.*|launching?\b.*|dropping\b.*)$/i;

const DESCRIPTION_PATTERN = /[.!?:;]$/;
const TAGLINE_PATTERN = /[•·|—–]/;
const SLOGAN_PATTERN = /^(go|get|be|stay|find|let|come|see)\s/i;

const words = (value: string) => normalizeComparable(value).split(/\s+/).filter(Boolean);

const sortedWordKey = (value: string) => words(value).sort().join(" ");

const splitCombinedItem = (value: string) =>
  value
    .split(/\s*(?:\+|,|\/|&|\band\b)\s*/i)
    .map(normalizeComparable)
    .filter(Boolean);

const phraseNoiseScore = (value: string) => {
  const tokenList = words(value);
  const tokenCount = tokenList.length;
  const uniqueCount = new Set(tokenList).size;
  const repeatedPenalty = Math.max(0, tokenCount - uniqueCount);
  const punctuationPenalty = (value.match(/[-–—/]/g) || []).length;
  return tokenCount + repeatedPenalty * 2 + punctuationPenalty;
};

const preferCleanerPhrase = (a: string, b: string) => {
  const aScore = phraseNoiseScore(a);
  const bScore = phraseNoiseScore(b);
  if (aScore !== bScore) return aScore < bScore ? a : b;
  return a.length <= b.length ? a : b;
};

const isSimilarPhrase = (a: string, b: string) => {
  const aNorm = normalizeComparable(a);
  const bNorm = normalizeComparable(b);
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) return true;
  if (sortedWordKey(aNorm) === sortedWordKey(bNorm)) return true;

  const aWords = words(aNorm);
  const bWords = words(bNorm);
  const aUnique = [...new Set(aWords)];
  const bUnique = [...new Set(bWords)];

  if (aUnique.length >= 3 && bUnique.length >= 3) {
    const bSet = new Set(bUnique);
    const overlap = aUnique.filter((token) => bSet.has(token)).length;
    const ratio = overlap / Math.max(aUnique.length, bUnique.length);
    if (overlap >= 4 && ratio >= 0.6) return true;
  }

  if (Math.min(aWords.length, bWords.length) >= 2) {
    if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;
  }

  return false;
};

export const getUniqueItems = (items?: string[]) => {
  if (!items || items.length === 0) return [];

  // Expand items that are concatenated with double-spaces into separate items
  const expanded = items.flatMap((item) => {
    const trimmed = item.trim();
    if (!trimmed) return [];
    // Split on double-space (common concatenation artifact)
    const parts = trimmed.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts : [trimmed];
  });

  // First pass: case-insensitive dedup
  const unique = Array.from(
    new Map(expanded.map((item) => [item.toLowerCase(), item] as const)).values()
  );

  // Second pass: normalized dedup (strip all non-alphanum)
  const normDeduped = Array.from(
    new Map(unique.map((item) => [normalizeComparable(item), item] as const)).values()
  );

  // Third pass: deduplicate items that have the same words in different order
  const sortedDeduped = Array.from(
    new Map(normDeduped.map((item) => [sortedWordKey(item), item] as const)).values()
  );

  // Fourth pass: remove combined items whose parts all exist individually
  return sortedDeduped.filter((item) => {
    const parts = splitCombinedItem(item);
    if (parts.length < 2) return true;

    const otherNorms = sortedDeduped
      .filter((other) => other !== item)
      .map(normalizeComparable);

    const allPartsListed = parts.every((part) => otherNorms.some((other) => other === part));
    if (allPartsListed) return false;

    const allPartsInOneOther = otherNorms.some((other) => parts.every((part) => other.includes(part)));
    if (allPartsInOneOther) return false;

    const joinedParts = parts.join(" ");
    if (otherNorms.some((other) => other === joinedParts)) return false;

    return true;
  });
};

export const stripBrandFromItem = (item: string, brand: string): string => {
  const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brandWithoutLeadingThe = brand.replace(/^the\s+/i, "").trim();
  const escapedShortBrand = brandWithoutLeadingThe
    ? brandWithoutLeadingThe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : "";
  const variants = [escapedBrand, escapedShortBrand].filter(Boolean).join("|");

  if (!variants) return item.trim();

  const pattern = new RegExp(`\\s+by\\s+(?:${variants})\\b[\\s.,:;!\\-–—]*$`, "i");
  return item.replace(pattern, "").trim();
};

export const isTitleRedundantWithItems = (title: string, items: string[]) => {
  if (items.length === 0) return false;
  const normalizedTitle = normalizeComparable(title);
  if (!normalizedTitle) return false;
  return items.every((item) => normalizedTitle.includes(normalizeComparable(item)));
};

const isGenericLabel = (value: string) => GENERIC_LABEL_PATTERN.test(value.trim());

export const getDisplayItems = (items: string[] | undefined, title: string, brand: string) => {
  const uniqueItems = getUniqueItems(items);
  let strippedTitle = stripBrandFromItem(title, brand);
  if (isGenericLabel(strippedTitle) && uniqueItems.length > 0) {
    const firstProduct = uniqueItems.find((i) => !isGenericLabel(i) && !PRICE_ONLY_ITEM_PATTERN.test(i.trim()));
    if (firstProduct) strippedTitle = firstProduct;
  }
  const normalizedTitle = normalizeComparable(strippedTitle);

  const cleanedItems = uniqueItems
    .filter((item) => !PRICE_ONLY_ITEM_PATTERN.test(item.trim()))
    .filter((item) => !GENERIC_LABEL_PATTERN.test(item.trim()))
    .filter((item) => !DESCRIPTION_PATTERN.test(item.trim()))
    .filter((item) => !TAGLINE_PATTERN.test(item))
    .filter((item) => !(SLOGAN_PATTERN.test(item.trim()) && item.trim().split(/\s+/).length <= 3))
    .map((item) => stripBrandFromItem(item, brand))
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => normalizeComparable(item) !== normalizedTitle)
    .filter((item) => {
      const itemNorm = normalizeComparable(item);
      const itemWords = words(itemNorm);
      if (itemWords.length <= 1 && normalizedTitle.includes(itemNorm)) return false;
      if (itemWords.length <= 2 && /^(pre|made|new|old|re)\b/i.test(item.trim())) return false;
      return true;
    });

  const deduped: string[] = [];

  for (const item of cleanedItems) {
    const similarIndex = deduped.findIndex((existing) => isSimilarPhrase(existing, item));
    if (similarIndex === -1) {
      deduped.push(item);
      continue;
    }

    deduped[similarIndex] = preferCleanerPhrase(deduped[similarIndex], item);
  }

  const hideRedundantTitle = isTitleRedundantWithItems(strippedTitle, deduped);

  return { filteredItems: deduped, hideRedundantTitle, displayTitle: strippedTitle };
};
