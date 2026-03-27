import { Router } from "express";
import { db } from "../db.js";
import { brands, brandPosts } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

interface ExtractedInfo {
  productName: string | null;
  price: string | null;
  releaseDate: string | null;
  releaseTime: string | null;
  isPremade: boolean | null;
  items: string[];
  type: "drop" | "restock" | "collab" | "news";
  summary: string;
}

const TZ_OFFSETS: Record<string, number> = {
  GMT: 0, UTC: 0,
  BST: 1, CET: 1,
  CEST: 2,
  EST: -5, ET: -5,
  CST: -6, CT: -6,
  PST: -8, PT: -8,
  PDT: -7,
  EDT: -4,
  CDT: -5,
  MDT: -6, MST: -7,
};

function mergeTimeIntoDate(dateIso: string, releaseTime: string | null): string {
  if (!releaseTime) return dateIso;
  const timeMatch = releaseTime.match(/(\d{1,2})\s*(AM|PM)\s*\(?\s*([A-Z]{2,4})?\s*\)?/i);
  if (!timeMatch) return dateIso;
  let hour = Number(timeMatch[1]);
  const ampm = timeMatch[2].toUpperCase();
  const tz = timeMatch[3]?.toUpperCase() || null;
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const offset = tz && tz in TZ_OFFSETS ? TZ_OFFSETS[tz] : 0;
  const utcHour = ((hour - offset) % 24 + 24) % 24;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  date.setUTCHours(utcHour, 0, 0, 0);
  return date.toISOString();
}

function extractDatesFromText(text: string): string[] {
  const months: Record<string, number> = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
    august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9,
    november: 10, nov: 10, december: 11, dec: 11,
  };
  const pattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/gi;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  const year = new Date().getFullYear();
  while ((m = pattern.exec(text)) !== null) {
    const monthNum = months[m[1].toLowerCase()];
    const day = parseInt(m[2], 10);
    const yr = m[3] ? parseInt(m[3], 10) : year;
    if (monthNum !== undefined && day >= 1 && day <= 31) {
      const d = new Date(yr, monthNum, day);
      if (!Number.isNaN(d.getTime())) results.push(d.toISOString());
    }
  }
  return results;
}

function fallbackExtract(text: string): ExtractedInfo {
  const caption = text.toLowerCase();
  const priceMatch = text.match(/\$[\d,.]+/);
  const firstLine = text.split("\n")[0]?.trim().slice(0, 100);
  let type: ExtractedInfo["type"] = "news";
  if (caption.includes("restock") || caption.includes("re-stock")) type = "restock";
  else if (caption.includes("collab") || caption.includes("collaboration")) type = "collab";
  else if (caption.includes("drop") || caption.includes("release") || caption.includes("launch")) type = "drop";
  const dates = extractDatesFromText(text);
  return {
    productName: firstLine || null,
    price: priceMatch?.[0] || null,
    releaseDate: dates[0] || null,
    releaseTime: null,
    isPremade: null,
    items: [],
    type,
    summary: firstLine || "New post",
  };
}

async function extractWithAI(text: string, brandName: string): Promise<ExtractedInfo> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.warn("No OPENAI_API_KEY, falling back to regex");
    return fallbackExtract(text);
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a streetwear release data extractor. Given text from an Instagram post or bio, extract structured release information. Respond ONLY with valid JSON, no markdown.

Return this exact JSON structure:
{
  "productName": "main product or collection name, or null",
  "price": "price as string like '$60' or null",
  "releaseDate": "ISO date string (YYYY-MM-DDTHH:mm:ss.000Z) or null - use current year ${new Date().getFullYear()} if year not specified",
  "releaseTime": "time as string like '6PM EST' or '11AM PST' or null",
  "isPremade": true/false/null,
  "items": ["list of actual clothing item names mentioned - include the garment type like 'hoodie', 'denim jeans', 'jacket', 'trousers'. If a product has a name AND a garment type (e.g. 'Grounded Moss' is '18oz selvedge denim'), include BOTH the product name and a description like 'Grounded Moss - 18oz selvedge denim'. Do NOT include taglines, slogans, marketing phrases, or garment construction details like seam types or pocket styles."],
  "type": "drop" or "restock" or "collab" or "news",
  "summary": "one-line summary of what's happening"
}`,
          },
          {
            role: "user",
            content: `Brand: ${brandName}\n\nText:\n${text.slice(0, 1500)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });
    if (!response.ok) return fallbackExtract(text);
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as ExtractedInfo;
  } catch {
    return fallbackExtract(text);
  }
}

function normalizeForCompare(v: string) { return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function stripBrandSuffix(value: string, brandName: string): string {
  if (!value) return value;
  const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const short = brandName.replace(/^the\s+/i, "").trim();
  const escapedShort = short ? short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const variants = [escaped, escapedShort].filter(Boolean).join("|");
  if (!variants) return value.trim();
  return value.replace(new RegExp(`\\s+by\\s+(?:${variants})\\b[\\s.,:;!\\-–—]*$`, "i"), "").replace(/\s{2,}/g, " ").trim();
}
function isLikelyProductItem(item: string): boolean {
  if (!/[a-z]/i.test(item)) return false;
  if (/(pocket|stitch|hem|liner|lining|silhouette|button|seam|placket|gusset|thread|finish interior)/i.test(item)) return false;
  return true;
}

function resolveReleaseDate(caption: string, aiReleaseDate: string | null, postDateIso: string | null, releaseTime: string | null = null): string | null {
  const explicitDates = extractDatesFromText(caption);
  if (explicitDates.length > 0) {
    if (!postDateIso) return mergeTimeIntoDate(explicitDates[0], releaseTime);
    const postDate = new Date(postDateIso);
    if (Number.isNaN(postDate.getTime())) return mergeTimeIntoDate(explicitDates[0], releaseTime);
    const nearest = explicitDates.map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => Math.abs(a.getTime() - postDate.getTime()) - Math.abs(b.getTime() - postDate.getTime()))[0];
    return mergeTimeIntoDate(nearest ? nearest.toISOString() : explicitDates[0], releaseTime);
  }
  if (aiReleaseDate) {
    const parsed = new Date(aiReleaseDate);
    if (!Number.isNaN(parsed.getTime())) {
      const hasTime = parsed.getUTCHours() !== 0 || parsed.getUTCMinutes() !== 0;
      if (!postDateIso) return hasTime ? parsed.toISOString() : mergeTimeIntoDate(parsed.toISOString(), releaseTime);
      const postDate = new Date(postDateIso);
      if (!Number.isNaN(postDate.getTime())) {
        const diffDays = Math.abs(parsed.getTime() - postDate.getTime()) / (24 * 60 * 60 * 1000);
        if (diffDays <= 45) return hasTime ? parsed.toISOString() : mergeTimeIntoDate(parsed.toISOString(), releaseTime);
      }
    }
  }
  if (postDateIso && /(available now|ready to ship|in store now|out now)/i.test(caption)) {
    const postDate = new Date(postDateIso);
    if (!Number.isNaN(postDate.getTime())) return postDate.toISOString();
  }
  return null;
}

async function parseApifyPosts(results: any[], brandName: string) {
  const posts: any[] = [];
  const items = results.filter((item) => item.caption || item.text);
  const batchSize = 5;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const extractions = await Promise.all(
      batch.map((item) => {
        const caption = item.caption || item.text || "";
        return caption.length > 10 ? extractWithAI(caption, brandName) : Promise.resolve(fallbackExtract(caption));
      })
    );
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const info = extractions[j];
      const caption = item.caption || item.text || "";
      const postUrl = item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : undefined);
      const imageUrl = item.displayUrl || item.imageUrl || (item.images && item.images[0]) || null;
      const rawPostDate = item.timestamp || item.takenAt || null;
      const postDateIso = rawPostDate ? new Date(rawPostDate).toISOString() : null;
      let type = "post";
      if (item.type === "Video" || item.isVideo) type = "reel";
      else if (item.type === "Sidecar") type = "carousel";
      const summaryBase = stripBrandSuffix(info.summary || info.productName || caption.split("\n")[0]?.trim().slice(0, 80) || "Post", brandName) || "Post";
      const cleanItems = info.items.map((p: string) => stripBrandSuffix(p, brandName)).filter(Boolean);
      const productItems = cleanItems.filter(isLikelyProductItem);
      const primaryItem = productItems[0];
      const shouldAppend = Boolean(primaryItem && !normalizeForCompare(summaryBase).includes(normalizeForCompare(primaryItem)));
      const productName = shouldAppend ? `${summaryBase}-${primaryItem}` : summaryBase;
      const resolvedReleaseDate = resolveReleaseDate(caption, info.releaseDate, postDateIso, info.releaseTime);
      posts.push({ url: postUrl, caption, imageUrl, type, productName, price: info.price, releaseDate: resolvedReleaseDate, rawContent: caption, postDate: postDateIso, items: cleanItems });
    }
  }
  return posts;
}

router.post("/instagram", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: "URL is required" });

    const apifyKey = process.env.APIFY_API_KEY;
    if (!apifyKey) return res.status(500).json({ success: false, error: "Apify API key not configured" });

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) formattedUrl = `https://${formattedUrl}`;

    let instagramHandle = "";
    try {
      const parsed = new URL(formattedUrl);
      if (parsed.hostname.includes("instagram.com")) {
        instagramHandle = parsed.pathname.split("/").filter(Boolean)[0] || "";
      }
    } catch {
      instagramHandle = formattedUrl.replace("@", "").replace(/https?:\/\//, "");
    }
    if (!instagramHandle) return res.status(400).json({ success: false, error: "Could not extract Instagram handle from URL" });

    const profileUrl = `https://www.instagram.com/${instagramHandle}/`;
    console.log("Scraping Instagram profile via Apify:", profileUrl);

    const actorRunResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [instagramHandle], resultsLimit: 30 }),
      }
    );

    if (!actorRunResponse.ok) {
      const errText = await actorRunResponse.text();
      return res.status(500).json({ success: false, error: `Apify error (${actorRunResponse.status}): ${errText.slice(0, 200)}` });
    }

    const apifyResults = await actorRunResponse.json();
    if (!apifyResults || apifyResults.length === 0) return res.status(404).json({ success: false, error: "No data found for this profile" });

    const profileData = apifyResults[0];
    const brandName = profileData.fullName || profileData.username || instagramHandle;
    const bio = profileData.biography || "";
    const externalUrl = profileData.externalUrl || profileData.externalUrlShimmed || null;
    let websiteUrl = externalUrl;
    if (!websiteUrl) {
      const urlMatch = bio.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/i);
      if (urlMatch) websiteUrl = urlMatch[0].startsWith("http") ? urlMatch[0] : `https://${urlMatch[0]}`;
    }

    const latestPosts = profileData.latestPosts || profileData.posts || [];
    const topLevelPosts = apifyResults.slice(1).filter((item: any) => item.shortCode || item.caption || item.text);
    const allPostItems = [...latestPosts, ...topLevelPosts];

    const bioInfo = await extractWithAI(bio, brandName);
    const posts = await parseApifyPosts(allPostItems, brandName);

    const bioHasMonthDateSignal = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(bio);
    const bioReleaseDate = bioHasMonthDateSignal ? resolveReleaseDate(bio, bioInfo.releaseDate, null, bioInfo.releaseTime) : null;
    if (bioReleaseDate || bioInfo.items.length > 0) {
      const bioSummary = stripBrandSuffix(bioInfo.summary || brandName, brandName) || brandName;
      const bioItems = bioInfo.items.map((item: string) => stripBrandSuffix(item, brandName)).filter(Boolean);
      const bioPrimaryItem = bioItems.find(isLikelyProductItem) || bioItems[0];
      const shouldAppend = Boolean(bioPrimaryItem && !normalizeForCompare(bioSummary).includes(normalizeForCompare(bioPrimaryItem)));
      const title = shouldAppend ? `${bioSummary}-${bioPrimaryItem}` : bioSummary;
      posts.unshift({ url: profileUrl, caption: bio, imageUrl: profileData.profilePicUrl || null, type: "bio", productName: title, price: bioInfo.price || undefined, releaseDate: bioReleaseDate, rawContent: bio, postDate: new Date().toISOString(), items: bioItems });
    }

    const [brand] = await db
      .insert(brands)
      .values({
        name: brandName,
        url: profileUrl,
        websiteUrl: websiteUrl || null,
        logoLetter: brandName.slice(0, 2).toUpperCase(),
        instagramHandle,
        bio: bio.slice(0, 500),
        isMonitoring: true,
      })
      .onConflictDoUpdate({
        target: brands.instagramHandle,
        set: {
          name: brandName,
          url: profileUrl,
          websiteUrl: websiteUrl || null,
          logoLetter: brandName.slice(0, 2).toUpperCase(),
          bio: bio.slice(0, 500),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (posts.length > 0) {
      const existingPosts = await db.select({ id: brandPosts.id, postUrl: brandPosts.postUrl, postType: brandPosts.postType }).from(brandPosts).where(eq(brandPosts.brandId, brand.id));
      const existingByUrl = new Map(existingPosts.filter((p) => p.postUrl).map((p) => [p.postUrl!, p.id]));
      const existingBioIds = existingPosts.filter((p) => p.postType === "bio").map((p) => p.id);
      const existingBioId = existingBioIds[0] || null;
      const hasBioInCurrentRun = posts.some((p) => p.type === "bio");

      if (!hasBioInCurrentRun && existingBioIds.length > 0) {
        for (const bioId of existingBioIds) {
          await db.delete(brandPosts).where(eq(brandPosts.id, bioId));
        }
      }

      for (const post of posts) {
        const record = {
          caption: post.caption || null,
          imageUrl: post.imageUrl || null,
          postType: post.type || "post",
          extractedProductName: post.productName || null,
          extractedPrice: post.price || null,
          extractedReleaseDate: post.releaseDate ? new Date(post.releaseDate) : null,
          extractedListedItems: post.items && post.items.length > 0 ? post.items : null,
          rawContent: post.rawContent || null,
          postDate: post.postDate ? new Date(post.postDate) : null,
        };

        if (post.url && existingByUrl.has(post.url)) {
          await db.update(brandPosts).set(record).where(eq(brandPosts.id, existingByUrl.get(post.url)!));
        } else if (post.type === "bio" && existingBioId) {
          await db.update(brandPosts).set(record).where(eq(brandPosts.id, existingBioId));
        } else {
          await db.insert(brandPosts).values({ brandId: brand.id, postUrl: post.url || null, ...record });
        }
      }
    }

    res.json({ success: true, brand: { id: brand.id, name: brandName, handle: instagramHandle, bio, postsCount: posts.length }, posts });
  } catch (err: any) {
    console.error("Scrape error:", err);
    res.status(500).json({ success: false, error: err.message || "Unknown error" });
  }
});

router.post("/all-brands", async (req, res) => {
  try {
    const monitoredBrands = await db.select({ id: brands.id, instagramHandle: brands.instagramHandle, name: brands.name }).from(brands).where(eq(brands.isMonitoring, true));
    if (!monitoredBrands.length) return res.json({ success: true, message: "No brands to scrape" });

    const results: Array<{ brand: string; success: boolean; error?: string }> = [];
    for (const brand of monitoredBrands) {
      try {
        const profileUrl = `https://www.instagram.com/${brand.instagramHandle}/`;
        const response = await fetch(`${req.protocol}://${req.get("host")}/api/scrape/instagram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: profileUrl }),
        });
        const result = await response.json();
        results.push({ brand: brand.name, success: result.success === true, error: result.error });
        if (monitoredBrands.length > 1) await new Promise((r) => setTimeout(r, 2000));
      } catch (err: any) {
        results.push({ brand: brand.name, success: false, error: err.message });
      }
    }
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
