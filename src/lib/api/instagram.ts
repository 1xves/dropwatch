import type { Release } from "@/components/ReleaseCalendar";
import type { Alert } from "@/components/AlertsFeed";

export interface ScrapedBrand {
  id: string;
  name: string;
  handle: string;
  bio: string;
  postsCount: number;
}

export interface ScrapedPost {
  url?: string;
  caption?: string;
  imageUrl?: string;
  type: string;
  productName?: string;
  price?: string;
  releaseDate?: string | null;
  rawContent?: string;
}

export interface ScrapeResult {
  success: boolean;
  error?: string;
  brand?: ScrapedBrand;
  posts?: ScrapedPost[];
}

export async function scrapeInstagramProfile(url: string): Promise<ScrapeResult> {
  const res = await fetch("/api/scrape/instagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}

export async function scrapeAllBrands(): Promise<{ success: boolean; results?: any[]; error?: string }> {
  const res = await fetch("/api/scrape/all-brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function fetchBrands() {
  const res = await fetch("/api/brands");
  if (!res.ok) throw new Error("Failed to fetch brands");
  return res.json();
}

export async function fetchBrandPosts(brandId: string) {
  const res = await fetch(`/api/posts/${brandId}`);
  if (!res.ok) throw new Error("Failed to fetch brand posts");
  return res.json();
}

export async function fetchAllPosts() {
  const res = await fetch("/api/posts");
  if (!res.ok) throw new Error("Failed to fetch posts");
  return res.json();
}

export async function deleteBrand(id: string) {
  const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete brand");
}

/** Convert DB posts into Release objects for the calendar/drops */
export function postsToReleases(
  posts: Array<{
    id: string;
    extractedProductName?: string | null;
    extracted_product_name?: string | null;
    extractedPrice?: string | null;
    extracted_price?: string | null;
    extractedReleaseDate?: string | null;
    extracted_release_date?: string | null;
    postDate?: string | null;
    post_date?: string | null;
    imageUrl?: string | null;
    image_url?: string | null;
    caption: string | null;
    postType?: string | null;
    post_type?: string | null;
    brands?: { name: string } | null;
  }>
): Release[] {
  const MAX_ANNOUNCEMENT_LEAD_DAYS = 120;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const releaseIndex = new Map<string, Release>();
  const orderedPosts = [...posts].sort((a, b) => {
    const aDate = a.postDate ?? a.post_date;
    const bDate = b.postDate ?? b.post_date;
    const aTime = aDate ? new Date(aDate).getTime() : 0;
    const bTime = bDate ? new Date(bDate).getTime() : 0;
    return bTime - aTime;
  });

  for (const post of orderedPosts) {
    const extractedReleaseDate = post.extractedReleaseDate ?? post.extracted_release_date;
    if (!extractedReleaseDate) continue;

    let parsedDate = parseReleaseDate(extractedReleaseDate);
    if (!parsedDate) continue;

    const postDateStr = post.postDate ?? post.post_date;
    const parsedPostDate = postDateStr ? new Date(postDateStr) : null;
    const postDate = parsedPostDate && !Number.isNaN(parsedPostDate.getTime()) ? parsedPostDate : null;

    const captionDate = extractReleaseDateFromText(post.caption || "");
    if (captionDate && postDate) {
      const captionDayKey = toDayKey(captionDate);
      const parsedDayKey = toDayKey(parsedDate);
      if (captionDayKey !== parsedDayKey) {
        const captionLead = (captionDate.getTime() - postDate.getTime()) / MS_PER_DAY;
        if (captionLead >= -7 && captionLead <= MAX_ANNOUNCEMENT_LEAD_DAYS) {
          parsedDate = captionDate;
        }
      }
    }

    const date = normalizeReleaseDate(parsedDate, postDate);

    if (postDate) {
      const leadDays = (date.getTime() - postDate.getTime()) / MS_PER_DAY;
      if (leadDays > MAX_ANNOUNCEMENT_LEAD_DAYS) continue;
    }

    const caption = (post.caption || "").toLowerCase();
    const captionFirstLines = caption.split("\n").map((l: string) => l.trim()).filter(Boolean).slice(0, 3).join(" ");
    const isCommunityDayPrimary = /community\s+day/i.test(captionFirstLines);
    let type: "drop" | "restock" | "collab" | "event" = "drop";
    if (isCommunityDayPrimary || caption.includes("pop-up") || caption.includes("popup") || caption.includes("booth")) {
      type = "event";
    } else if (caption.includes("restock") || caption.includes("re-stock")) {
      type = "restock";
    } else if (caption.includes("collab") || caption.includes("collaboration") || /\b[a-z]+\s+x\s+[a-z]+/i.test(caption) || caption.includes("×")) {
      type = "collab";
    }

    const fullCaption = post.caption || "";
    const timeMatch = fullCaption.match(/(\d{1,2})\s*(AM|PM)\s*\(?\s*(GMT|EST|PST|CST|BST|CET|CEST|PT|ET|CT)?\s*\)?/i);
    const releaseTime = timeMatch
      ? formatReleaseTimeLocal(Number(timeMatch[1]), timeMatch[2].toUpperCase() as "AM" | "PM", timeMatch[3]?.toUpperCase() || null)
      : undefined;

    const rawNameFull = (post.extractedProductName ?? post.extracted_product_name) || (post.caption?.split("\n")[0]?.slice(0, 60) || "Untitled Post");
    const rawNameParts = rawNameFull.includes(" + ") ? rawNameFull.split(" + ").map((p) => p.trim()).filter(Boolean) : [rawNameFull];
    const postImageUrl = post.imageUrl ?? post.image_url;
    const postType = post.postType ?? post.post_type;
    const postExtractedPrice = post.extractedPrice ?? post.extracted_price;
    const postCaption = post.caption || "";

    const dbItems = (post.extractedListedItems ?? post.extracted_listed_items) as string[] | null | undefined;

    for (let partIdx = 0; partIdx < rawNameParts.length; partIdx++) {
      const rawName = rawNameParts[partIdx];
      let name = rawName;
      const itemsFromDb = dbItems && dbItems.length > 0 ? dbItems : [];
      const itemsFromName = extractItemsFromProductName(rawName);
      const itemsFromCaption = postCaption ? extractItemsFromCaption(postCaption) : [];
      const items = itemsFromDb.length > 0 ? itemsFromDb : (itemsFromName.length > 0 ? itemsFromName : itemsFromCaption);

      const dashIdx = rawName.indexOf(" — ");
      if (dashIdx !== -1) {
        name = rawName.slice(0, dashIdx).trim();
      }

      name = name.replace(/\s*\[PREMADE\]\s*/gi, "").replace(/\s*\[Made-to-order\]\s*/gi, "").trim();
      name = name.replace(/\s*@\s*\d+\s*(AM|PM)\s*\w*/gi, "").trim();

      name = name.replace(/^next\s+release\s*[:\-–—]\s*/i, "").trim();
      const GENERIC_RELEASE_RE = /^(new\s+)?(drop|release|restock|announcement|coming\s+soon|out\s+now|available\s+now|pre[-\s]?order|sold\s+out|next\s+release\b.*|launching?\b.*|dropping\b.*)$/i;
      const isJustDate = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(name) || /^\d{1,2}(st|nd|rd|th)?\s/i.test(name);
      if (!name || isJustDate || GENERIC_RELEASE_RE.test(name.trim())) {
        if (items.length > 0) {
          name = items[0];
        } else {
          continue;
        }
      }

      const { title: shortTitle, detailItem } = splitNameIntoTitleAndItem(name);
      name = shortTitle;
      if (detailItem) {
        items.push(detailItem);
      }

      if (isCommunityDayPrimary) {
        name = "Community Day";
        type = "event";
      }

      if (type === "event" && (/booth\b/i.test(rawName) || /pop-?up/i.test(rawName))) {
        const captionLines = postCaption.split("\n").map((l) => l.trim()).filter(Boolean);
        const venueLine = captionLines.find((l) =>
          /^[A-Z][a-zA-Z\s]{3,30}$/.test(l) &&
          l.split(/\s+/).length <= 4 &&
          !/@|#|!/.test(l)
        );
        name = venueLine ? `Pop-Up at ${venueLine}` : "Pop-Up";
      }

      const rawBrand = post.brands?.name ?? "Unknown";
      const brand = rawBrand === rawBrand.toLowerCase()
        ? rawBrand.replace(/\b\w/g, (c) => c.toUpperCase())
        : rawBrand;
      const nameKey = `${brand}|${name.toLowerCase().trim()}`;
      const rootKey = `${brand}|${getReleaseRootKey(name)}`;
      const dateKey = `${brand}|${toDayKey(date)}`;
      const captionKey = `${brand}|${postCaption}|${toDayKey(date)}`;

      const existingByName = releaseIndex.get(nameKey);
      const brandWebsite = post.brands?.websiteUrl || post.brands?.website_url || "";
      const availableOnline = /available\s+(online|now|at\s+\w+\.\w+)|available\s+@|\.com\s+only/i.test(postCaption) ||
        (brandWebsite && /\b(shop|store|available|order|stock)\b/i.test(postCaption) && /\w+\.(com|co|shop|store)\b/i.test(postCaption + " " + brandWebsite));

      if (existingByName) {
        if (date < existingByName.date) {
          existingByName.date = date;
        }
        if (getNameDetailScore(name) > getNameDetailScore(existingByName.name)) {
          existingByName.name = name;
        }
        existingByName.items = [...new Set([...(existingByName.items || []), ...items])];
        if (!existingByName.imageUrl && postImageUrl && postType !== "bio") {
          existingByName.imageUrl = postImageUrl;
        }
        if (!existingByName.releaseTime && releaseTime) {
          existingByName.releaseTime = releaseTime;
        }
        if (existingByName.price === "TBD" && postExtractedPrice) {
          existingByName.price = postExtractedPrice;
        }
        if (availableOnline) existingByName.availableOnline = true;
        continue;
      }

      const existingByRoot = releaseIndex.get(rootKey);
      if (existingByRoot) {
        const daysBetween = Math.abs(date.getTime() - existingByRoot.date.getTime()) / MS_PER_DAY;
        if (daysBetween <= 30) {
          if (date < existingByRoot.date) {
            existingByRoot.date = date;
          }
          if (getNameDetailScore(name) > getNameDetailScore(existingByRoot.name)) {
            existingByRoot.name = name;
          }
          existingByRoot.items = [...new Set([...(existingByRoot.items || []), ...items])];
          if (!existingByRoot.imageUrl && postImageUrl && postType !== "bio") {
            existingByRoot.imageUrl = postImageUrl;
          }
          if (!existingByRoot.releaseTime && releaseTime) {
            existingByRoot.releaseTime = releaseTime;
          }
          if (existingByRoot.price === "TBD" && postExtractedPrice) {
            existingByRoot.price = postExtractedPrice;
          }
          if (availableOnline) existingByRoot.availableOnline = true;
          releaseIndex.set(nameKey, existingByRoot);
          releaseIndex.set(rootKey, existingByRoot);
          releaseIndex.set(dateKey, existingByRoot);
          continue;
        }
      }

      const existingByCaption = releaseIndex.get(captionKey);
      if (existingByCaption) {
        if (!existingByCaption.items?.some((i) => i.toLowerCase() === name.toLowerCase())) {
          existingByCaption.items = [...(existingByCaption.items || []), name];
        }
        existingByCaption.items = [...new Set([...(existingByCaption.items || []), ...items])];
        if (!existingByCaption.imageUrl && postImageUrl && postType !== "bio") {
          existingByCaption.imageUrl = postImageUrl;
        }
        if (!existingByCaption.releaseTime && releaseTime) {
          existingByCaption.releaseTime = releaseTime;
        }
        if (existingByCaption.price === "TBD" && postExtractedPrice) {
          existingByCaption.price = postExtractedPrice;
        }
        releaseIndex.set(nameKey, existingByCaption);
        releaseIndex.set(rootKey, existingByCaption);
        continue;
      }

      const existingByDate = releaseIndex.get(dateKey);
      if (existingByDate) {
        const existingRoot = getReleaseRootKey(existingByDate.name).toLowerCase();
        const currentRoot = getReleaseRootKey(name).toLowerCase();
        const rootsOverlap = existingRoot === currentRoot ||
          existingRoot.includes(currentRoot) || currentRoot.includes(existingRoot);
        const collabMerge = (type === "collab") !== (existingByDate.type === "collab");
        if (rootsOverlap || collabMerge) {
          if (!collabMerge) {
            if (!existingByDate.items?.some((i) => i.toLowerCase() === name.toLowerCase())) {
              existingByDate.items = [...(existingByDate.items || []), name];
            }
            existingByDate.items = [...new Set([...(existingByDate.items || []), ...items])];
          }
          if (!existingByDate.imageUrl && postImageUrl && postType !== "bio") {
            existingByDate.imageUrl = postImageUrl;
          }
          if (!existingByDate.releaseTime && releaseTime) {
            existingByDate.releaseTime = releaseTime;
          }
          if (collabMerge && existingByDate.type === "collab" && type !== "collab") {
            existingByDate.name = name;
            existingByDate.type = type;
            existingByDate.items = [...items];
            if (postExtractedPrice) existingByDate.price = postExtractedPrice;
          } else if (!collabMerge && getNameDetailScore(name) > getNameDetailScore(existingByDate.name)) {
            existingByDate.name = name;
          }
          if (availableOnline) existingByDate.availableOnline = true;
          releaseIndex.set(nameKey, existingByDate);
          releaseIndex.set(rootKey, existingByDate);
          continue;
        }
      }

      const release = {
        id: rawNameParts.length > 1 ? `${post.id}-${partIdx}` : post.id,
        brand,
        name,
        date,
        price: postExtractedPrice || "TBD",
        type,
        imageUrl: postType === "bio" ? undefined : (postImageUrl || undefined),
        source: postType || "post",
        items,
        releaseTime,
        availableOnline,
      };
      releaseIndex.set(nameKey, release);
      releaseIndex.set(rootKey, release);
      releaseIndex.set(captionKey, release);
      if (!releaseIndex.has(dateKey)) {
        releaseIndex.set(dateKey, release);
      }
    }
  }

  for (const post of orderedPosts) {
    const p_extractedReleaseDate = post.extractedReleaseDate ?? post.extracted_release_date;
    if (p_extractedReleaseDate) continue;

    const p_extractedProductName = post.extractedProductName ?? post.extracted_product_name;
    const text = `${p_extractedProductName || ""}\n${post.caption || ""}`;
    const explicitDate = extractReleaseDateFromText(text);
    if (!explicitDate) continue;

    const extraItems = [
      ...extractItemsFromProductName(p_extractedProductName || ""),
      ...extractItemsFromCaption(post.caption || ""),
    ];

    if (extraItems.length === 0) continue;

    const brand = (post.brands as any)?.name || "Unknown";
    const targetRelease = releaseIndex.get(`${brand}|${toDayKey(explicitDate)}`);
    if (!targetRelease) continue;

    for (const item of extraItems) {
      if (!targetRelease.items?.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
        targetRelease.items = [...(targetRelease.items || []), item];
      }
    }

    const p_imageUrl = post.imageUrl ?? post.image_url;
    if (!targetRelease.imageUrl && p_imageUrl) {
      targetRelease.imageUrl = p_imageUrl;
    }

    // Also extract release time from this post if the target doesn't have one yet
    if (!targetRelease.releaseTime) {
      const fullCaption = post.caption || "";
      const timeMatch = fullCaption.match(/(\d{1,2})\s*(AM|PM)\s*\(?\s*(GMT|EST|PST|CST|BST|CET|CEST|PT|ET|CT)?\s*\)?/i);
      if (timeMatch) {
        targetRelease.releaseTime = formatReleaseTimeLocal(Number(timeMatch[1]), timeMatch[2].toUpperCase() as "AM" | "PM", timeMatch[3]?.toUpperCase() || null);
      }
    }
  }

  const unique = [...new Set(releaseIndex.values())];

  const merged: typeof unique = [];
  for (const rel of unique) {
    const existing = merged.find((m) => {
      if (m.brand !== rel.brand) return false;
      if (m.type === "event" || rel.type === "event") return false;
      const daysDiff = Math.abs(m.date.getTime() - rel.date.getTime()) / MS_PER_DAY;
      if (daysDiff > 3) return false;
      const mItems = (m.items || []).map((i) => i.toLowerCase());
      const rItems = (rel.items || []).map((i) => i.toLowerCase());
      const mName = m.name.toLowerCase();
      const rName = rel.name.toLowerCase();
      return rItems.some((i) => mItems.includes(i) || mName.includes(i))
        || mItems.some((i) => rName.includes(i));
    });
    if (existing) {
      existing.items = [...new Set([...(existing.items || []), ...(rel.items || [])])];
      if (getNameDetailScore(rel.name) > getNameDetailScore(existing.name)) {
        existing.name = rel.name;
      }
      if (!existing.imageUrl && rel.imageUrl) existing.imageUrl = rel.imageUrl;
      if (!existing.releaseTime && rel.releaseTime) existing.releaseTime = rel.releaseTime;
      if (existing.price === "TBD" && rel.price && rel.price !== "TBD") existing.price = rel.price;
    } else {
      merged.push(rel);
    }
  }

  const communityDayEvents = merged.filter((r) => /community\s+day/i.test(r.name));
  for (const cd of communityDayEvents) {
    const cdTime = cd.date.getTime();
    const sameDay = merged.filter(
      (r) => r !== cd && r.brand === cd.brand && Math.abs(r.date.getTime() - cdTime) < MS_PER_DAY
    );
    for (const rel of sameDay) {
      const relItems = rel.items && rel.items.length > 0 ? rel.items : [rel.name];
      for (const item of relItems) {
        if (!cd.items?.some((i) => i.toLowerCase() === item.toLowerCase())) {
          cd.items = [...(cd.items || []), item];
        }
      }
      if (!cd.imageUrl && rel.imageUrl) cd.imageUrl = rel.imageUrl;
      if (!cd.price || cd.price === "TBD") cd.price = rel.price;
    }
    for (const r of sameDay) {
      const idx = merged.indexOf(r);
      if (idx !== -1) merged.splice(idx, 1);
    }
  }

  return merged;
}

function splitNameIntoTitleAndItem(name: string): { title: string; detailItem: string | null } {
  // Match patterns like "Grounded Moss 18oz Green Cast Indigo Raw Japanese Selvedge Denim Wide Leg Trousers"
  // Split at the first fabric/weight keyword boundary
  const fabricPattern = /^(.+?)\s+(\d+\s*oz\b.+)$/i;
  const m = fabricPattern.exec(name);
  if (m) {
    return { title: m[1].trim(), detailItem: m[2].trim() };
  }

  // Also handle dash-joined detail: "Title-Detail"
  const dashIdx = name.indexOf("-");
  if (dashIdx > 0 && dashIdx < name.length - 1) {
    const before = name.slice(0, dashIdx).trim();
    const after = name.slice(dashIdx + 1).trim();
    // Only split if both parts are meaningful (>2 chars)
    if (before.length > 2 && after.length > 2) {
      return { title: before, detailItem: after };
    }
  }

  return { title: name, detailItem: null };
}

function parseReleaseDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeReleaseDate(releaseDate: Date, postDate: Date | null): Date {
  if (!postDate) return releaseDate;

  const shiftedBackOneYear = new Date(releaseDate);
  shiftedBackOneYear.setFullYear(shiftedBackOneYear.getFullYear() - 1);

  const distanceOriginal = Math.abs(releaseDate.getTime() - postDate.getTime());
  const distanceShifted = Math.abs(shiftedBackOneYear.getTime() - postDate.getTime());

  return distanceShifted < distanceOriginal ? shiftedBackOneYear : releaseDate;
}

const TZ_OFFSETS: Record<string, number> = {
  GMT: 0, UTC: 0,
  BST: 1, CET: 1,
  CEST: 2,
  EST: -5, ET: -5,
  CST: -6, CT: -6,
  PST: -8, PT: -8,
};

function formatReleaseTimeLocal(hour: number, ampm: "AM" | "PM", tz: string | null): string {
  // If no timezone specified, return raw time without conversion — we can't know the source tz
  if (!tz || !(tz in TZ_OFFSETS)) {
    return `${hour}${ampm}`;
  }

  const sourceOffsetHours = TZ_OFFSETS[tz];

  // Convert source hour to 24h UTC
  let hour24 = hour;
  if (ampm === "PM" && hour !== 12) hour24 += 12;
  if (ampm === "AM" && hour === 12) hour24 = 0;
  const utcHour = hour24 - sourceOffsetHours;

  // Convert UTC to local using the browser's offset
  const localOffsetMinutes = new Date().getTimezoneOffset(); // negative for east of UTC
  const localHour = ((utcHour - localOffsetMinutes / 60) % 24 + 24) % 24;

  const localAmpm = localHour >= 12 ? "PM" : "AM";
  const localDisplay = localHour === 0 ? 12 : localHour > 12 ? localHour - 12 : localHour;

  // Detect user's timezone abbreviation
  const localTz = Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value || "";

  return `${Math.round(localDisplay)}${localAmpm} ${localTz}`;
}

function extractItemsFromProductName(value: string): string[] {
  if (!value) return [];
  const dashIdx = value.indexOf(" — ");
  if (dashIdx === -1) return [];
  return value
    .slice(dashIdx + 3)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractItemsFromCaption(caption: string): string[] {
  if (!caption) return [];
  const lines = caption.split("\n").map((line) => line.trim());

  const isPlainProductLine = (line: string) => {
    if (!line || line.length < 3 || line.length > 60) return false;
    const lower = line.toLowerCase();
    if (line.split(/\s+/).length > 6) return false;
    if (line.startsWith("@") || line.startsWith("#")) return false;
    if (/@\w/.test(line)) return false;
    if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(line.trim())) return false;
    if (lower.includes("http") || lower.includes("www.") || lower.includes(".com") || lower.includes(".co")) return false;
    if (/\.\w{2,4}$/.test(lower) || /\.\w{2,4}\s/.test(lower)) return false;
    if (lower.includes("new release") || lower.includes("next release")) return false;
    if (lower.includes("ready to ship") || lower.includes("pre-made") || lower.includes("premade")) return false;
    if (lower.includes("gmt") || lower.includes("est") || lower.includes("pst")) return false;
    if (lower.includes("sign up") || lower.includes("only available") || lower.includes("early access")) return false;
    if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.test(lower)) return false;
    if (/^\d/.test(lower)) return false;
    if (lower.includes("wearing") || lower.includes("tops") || lower.includes("bottoms")) return false;
    if (lower.includes("size chart") || lower.includes("broadcast") || lower.includes("join via")) return false;
    if (lower.includes("📸") || lower.includes("🎥")) return false;
    if (/[\u{1F1E0}-\u{1F1FF}]/u.test(line)) return false;
    if (/\bin\s+[A-Z]/i.test(line.trim()) && line.trim().split(" ").length <= 5) return false;
    if (lower.includes("community") || lower.includes("announce") || lower.includes("rsvp")) return false;
    if (lower.includes("sponsored") || lower.includes("friendship") || lower.includes("newsletter")) return false;
    if (lower.includes("peace") || lower.includes("email")) return false;
    if (/^available\b/i.test(lower)) return false;
    if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(lower) && /\d/.test(lower)) return false;
    if (/^[A-Z][a-z]+[,.]?$/.test(line.trim())) return false;
    if (!/[a-zA-Z]/.test(line)) return false;
    if (/[!?.]$/.test(line.trim())) return false;
    if (/:$/.test(line.trim())) return false;
    if (lower.includes("rooted") || lower.includes("inspired") || lower.includes("spirit")) return false;
    if (lower.includes("journey") || lower.includes("finding") || lower.includes("reconnect")) return false;
    if (lower.includes("love,") || lower.includes("yours,") || lower.includes("sincerely")) return false;
    if (/^(go|get|be|stay|find|let|come|see)\s/i.test(line.trim()) && line.trim().split(/\s+/).length <= 3) return false;
    if (/^[-–—]\s/.test(line.trim())) return false;
    if (lower.includes("pocket") || lower.includes("stitch") || lower.includes("silhouette")) return false;
    if (lower.includes("button-fly") || lower.includes("button fly") || lower.includes("hem")) return false;
    if (lower.includes("lining") || lower.includes("liner") || lower.includes("welt")) return false;
    if (lower.includes("seam") || lower.includes("placket") || lower.includes("gusset")) return false;
    if (lower.includes("selvedge") || lower.includes("selvage")) return false;
    return true;
  };

  const productLines = lines.filter(isPlainProductLine);

  const bulletProductLines = lines
    .filter((l) => /^[•·]\s/.test(l.trim()))
    .map((l) => l.trim().replace(/^[•·]\s+/, "").trim())
    .filter((l) => l.length >= 3 && l.length <= 60 && !/[!?.]$/.test(l) && /[a-zA-Z]/.test(l))
    .filter((l) => {
      const lower = l.toLowerCase();
      return !lower.includes("pocket") && !lower.includes("stitch") && !lower.includes("lining") && !lower.includes("seam");
    });

  let finalBullets = bulletProductLines;
  if (bulletProductLines.length > 1) {
    const GARMENT_SUMMARY_RE = /\b(tees?|t-shirts?|shirts?|hoodies?|jackets?|pants|jeans|shorts|vests?|coats?|sweaters?|beanies?|caps?|hats?|pieces?)\b/i;
    const allDesignNames = bulletProductLines.every((item) => !GARMENT_TYPE_KEYWORDS.test(item) && !FABRIC_WEIGHT_PATTERN.test(item));
    if (allDesignNames) {
      const garmentMatch = caption.match(GARMENT_SUMMARY_RE);
      if (garmentMatch) {
        let gt = garmentMatch[1].toLowerCase();
        if (!gt.endsWith("s")) gt += "s";
        gt = gt.charAt(0).toUpperCase() + gt.slice(1);
        finalBullets = [gt];
      }
    }
  }

  const allItems = [...productLines, ...finalBullets];

  const garmentDesc = extractGarmentDescription(caption);
  if (garmentDesc) allItems.push(garmentDesc);
  return allItems;
}

const GARMENT_TYPE_KEYWORDS = /\b(denim|jeans|jacket|hoodie|pants|trousers|shirt|tee|t-shirt|shorts|vest|coat|chore\s*coat|overshirt|flannel|sweater|cardigan|cap|hat|beanie|bag|tote|sneaker|boot|selvedge|selvage|canvas|twill|corduroy|chambray|oxford)\b/i;
const FABRIC_WEIGHT_PATTERN = /\b\d+(\.\d+)?\s*oz\b/i;

function extractGarmentDescription(caption: string): string | null {
  if (!caption) return null;
  const bulletLines = caption
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-–—•·]\s/.test(l))
    .map((l) => l.replace(/^[-–—•·]\s+/, "").trim());

  const fabricLine = bulletLines.find(
    (l) => GARMENT_TYPE_KEYWORDS.test(l) || FABRIC_WEIGHT_PATTERN.test(l)
  );
  if (!fabricLine) return null;

  let desc = fabricLine
    .replace(/\b(raw|japanese|imported|premium|heavyweight|lightweight)\b/gi, "")
    .replace(/\b(green cast|blue cast)\b/gi, "")
    .replace(/\b(indigo)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (desc.length > 45) {
    const truncated = desc.slice(0, 45);
    const lastSpace = truncated.lastIndexOf(" ");
    desc = lastSpace > 10 ? truncated.slice(0, lastSpace).trim() : truncated.trim();
  }
  if (desc.length < 4) return null;
  return desc;
}

function extractReleaseDateFromText(text: string): Date | null {
  if (!text) return null;

  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const currentYear = new Date().getFullYear();

  const dayMonthMatch = text.match(/(?:\b(?:sun|mon|tue|wed|thu|fri|sat)(?:day)?\b\s*)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?/i);
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const monthToken = dayMonthMatch[2].toLowerCase();
    const month = monthMap[monthToken];
    const year = dayMonthMatch[3] ? Number(dayMonthMatch[3]) : currentYear;
    if (Number.isInteger(month)) return new Date(year, month, day);
  }

  const monthDayMatch = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/i);
  if (monthDayMatch) {
    const monthToken = monthDayMatch[1].toLowerCase();
    const month = monthMap[monthToken];
    const day = Number(monthDayMatch[2]);
    const year = monthDayMatch[3] ? Number(monthDayMatch[3]) : currentYear;
    if (Number.isInteger(month)) return new Date(year, month, day);
  }

  return null;
}

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getReleaseRootKey(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/\b(collection|drop|release|restock|event|edition)\b/g, " ")
    .replace(/\b\d{1,3}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return "unknown";
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ") || words[0] || "unknown";
}

function getNameDetailScore(name: string): number {
  const lower = name.toLowerCase();
  let score = Math.min(name.length / 24, 4);

  if (/\b(selvedge|denim|hoodie|jacket|pants|shirt|tee|wallet|canvas|leather|wool)\b/.test(lower)) score += 2;
  if (/\b\d+\s*oz\b/.test(lower)) score += 2;
  if (/\b(collection|event|community day)\b/.test(lower)) score -= 1;

  return score;
}

/** Convert DB posts into Alert objects */
export function postsToAlerts(
  posts: Array<{
    id: string;
    extractedProductName?: string | null;
    extracted_product_name?: string | null;
    extractedPrice?: string | null;
    extracted_price?: string | null;
    extractedListedItems?: string[] | null;
    extracted_listed_items?: string[] | null;
    caption: string | null;
    postDate?: string | null;
    post_date?: string | null;
    createdAt?: string;
    created_at?: string;
    brands?: { name: string } | null;
  }>
): Alert[] {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const recentPosts = posts.filter((post) => {
    const dateStr = post.postDate ?? post.post_date ?? post.createdAt ?? post.created_at ?? "";
    const postTime = new Date(dateStr);
    return postTime >= thirtyDaysAgo;
  });

  const grouped = new Map<string, typeof recentPosts>();
  for (const post of recentPosts) {
    const brand = post.brands?.name ?? "Unknown";
    const caption = post.caption || "";

    const releaseDate = extractReleaseDateFromText(caption);
    const releaseDayKey = releaseDate ? toDayKey(releaseDate) : null;

    const rawPostDate = post.postDate ?? post.post_date ?? post.createdAt ?? post.created_at ?? "";
    const postDayKey = rawPostDate ? new Date(rawPostDate).toISOString().slice(0, 10) : "";

    const groupKey = releaseDayKey
      ? `${brand}|release:${releaseDayKey}`
      : `${brand}|post:${caption}|${postDayKey}`;

    const group = grouped.get(groupKey);
    if (group) {
      group.push(post);
    } else {
      grouped.set(groupKey, [post]);
    }
  }

  const allAlerts: Alert[] = [];
  for (const group of grouped.values()) {
    const latestPost = group.reduce((latest, p) => {
      const ld = new Date(latest.postDate ?? latest.post_date ?? latest.createdAt ?? latest.created_at ?? "").getTime();
      const pd = new Date(p.postDate ?? p.post_date ?? p.createdAt ?? p.created_at ?? "").getTime();
      return pd > ld ? p : latest;
    });

    const allCaptions = group.map((p) => (p.caption || "").toLowerCase()).join(" ");
    const pPrice = group.map((p) => p.extractedPrice ?? p.extracted_price).find(Boolean) || null;
    const pDate = latestPost.postDate ?? latestPost.post_date ?? latestPost.createdAt ?? latestPost.created_at ?? "";

    const genericNamePattern = /^(new\s*(drop|release)|next\s*release|black\s*friday|exp5|lookbook|\d{1,2}(st|nd|rd|th)\b)/i;

    const itemNames = group
      .flatMap((p) => p.extractedListedItems ?? p.extracted_listed_items ?? [])
      .filter(Boolean);
    const uniqueItems = [...new Set(itemNames)];

    const productNames = group
      .map((p) => p.extractedProductName ?? p.extracted_product_name)
      .filter(Boolean) as string[];
    const splitNames = productNames.flatMap((n) =>
      n.split(/\s*[+&/]\s*/).map((s) => s.trim()).filter(Boolean)
    );
    const meaningfulNames = splitNames.filter((n) => !genericNamePattern.test(n.trim()));
    const uniqueNames = [...new Set(meaningfulNames.map((n) => n.toLowerCase()))]
      .map((lower) => meaningfulNames.find((n) => n.toLowerCase() === lower)!);

    let combinedName: string;
    if (uniqueItems.length > 0) {
      combinedName = uniqueItems.slice(0, 3).join(", ");
    } else if (uniqueNames.length > 0) {
      combinedName = uniqueNames.slice(0, 3).join(", ");
    } else if (splitNames.length > 0) {
      combinedName = splitNames[0]!;
    } else {
      combinedName = latestPost.caption?.split("\n")[0]?.slice(0, 80) || "New post detected";
    }

    let type: Alert["type"] = "news";
    let message = combinedName;

    if (allCaptions.includes("restock") || allCaptions.includes("re-stock")) {
      type = "restock";
      message = `Restock alert: ${message}`;
    } else if (pPrice) {
      type = "price_change";
      message = `${message} — ${pPrice}`;
    } else if (allCaptions.includes("drop") || allCaptions.includes("release") || allCaptions.includes("launch")) {
      type = "new_release";
    }

    const rawBrand = latestPost.brands?.name ?? "Unknown";
    const brand = rawBrand === rawBrand.toLowerCase()
      ? rawBrand.replace(/\b\w/g, (c) => c.toUpperCase())
      : rawBrand;

    allAlerts.push({
      id: latestPost.id,
      brand,
      message,
      type,
      timestamp: new Date(pDate),
    });
  }

  allAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return allAlerts.slice(0, 15);
}
