import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function extractWithAI(text: string, brandName: string): Promise<ExtractedInfo> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    console.warn("No LOVABLE_API_KEY, falling back to regex");
    return fallbackExtract(text);
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a streetwear release data extractor. Given text from an Instagram post or bio, extract structured release information. Respond ONLY with valid JSON, no markdown.

Return this exact JSON structure:
{
  "productName": "main product or collection name, or null",
  "price": "price as string like '$60' or null",
  "releaseDate": "ISO date string (YYYY-MM-DDTHH:mm:ss.000Z) or null - use current year ${new Date().getFullYear()} if year not specified. IMPORTANT: If a time and timezone are mentioned (e.g. '11am PST', '6PM GMT'), include them in the ISO date by converting to UTC. For example 'March 21st 11am PST' becomes '2025-03-21T19:00:00.000Z'.",
  "releaseTime": "time as string like '6PM EST' or '11AM PST' or null - include the timezone if mentioned",
  "isPremade": true/false/null (whether items are premade/ready-to-ship vs made-to-order),
  "items": ["list", "of", "individual", "items", "mentioned"],
  "type": "drop" or "restock" or "collab" or "news",
  "summary": "one-line summary of what's happening"
}

CRITICAL RULES:
- "drop" = new release/launch
- "restock" = items coming back in stock  
- "collab" = collaboration between brands
- "news" = general update/announcement
- **ITEMS**: You MUST extract EVERY individual product/item name mentioned in the text. Examples: "Henley hoodie", "Daily denim V2", "Fatigue pants", "Zip hoodie". Each item should be a separate entry in the items array. Do NOT leave items empty if products are mentioned.
- **DATES**: You MUST extract the release date even if written informally like "Sunday 29th March" or "March 1st". Convert to ISO format. If no year is given, use ${new Date().getFullYear()}.
- **PREMADE**: If the text says "pre-made", "premade", "ready to ship", or "ready-to-ship", set isPremade to true.
- "summary" should be a concise, descriptive product/collection name that captures WHAT is being released (e.g. "Grounded Moss 18oz Selvedge Denim", "Waxed Canvas Work Jacket", "Spring Essentials Collection"). Do NOT use generic labels like "March 29th Drop" or "New Release". Summarize the key product details (fabric, colorway, style) into a short title.`
          },
          {
            role: "user",
            content: `Brand: ${brandName}\n\nText:\n${text.slice(0, 1500)}`,
          }
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`AI extraction failed: ${response.status} ${response.statusText}`, errText.slice(0, 200));
      return fallbackExtract(text);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    // Clean markdown code fences if present
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed as ExtractedInfo;
  } catch (err) {
    console.error("AI extraction error:", err);
    return fallbackExtract(text);
  }
}

function fallbackExtract(text: string): ExtractedInfo {
  const caption = text.toLowerCase();
  const priceMatch = text.match(/\$[\d,.]+/);
  const firstLine = text.split("\n")[0]?.trim().slice(0, 100);

  let type: ExtractedInfo["type"] = "news";
  if (caption.includes("restock") || caption.includes("re-stock")) type = "restock";
  else if (caption.includes("collab") || caption.includes("collaboration")) type = "collab";
  else if (caption.includes("drop") || caption.includes("release") || caption.includes("launch")) type = "drop";

  // Extract dates
  let releaseDate: string | null = null;
  const dates = extractDatesFromText(text);
  if (dates.length > 0) releaseDate = dates[0];

  return {
    productName: firstLine || null,
    price: priceMatch?.[0] || null,
    releaseDate,
    releaseTime: null,
    isPremade: null,
    items: [],
    type,
    summary: firstLine || "New post",
  };
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripBrandSuffix(value: string, brandName: string): string {
  if (!value) return value;

  const escapedBrand = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shortBrand = brandName.replace(/^the\s+/i, "").trim();
  const escapedShortBrand = shortBrand ? shortBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const variants = [escapedBrand, escapedShortBrand].filter(Boolean).join("|");
  if (!variants) return value.trim();

  const pattern = new RegExp(`\\s+by\\s+(?:${variants})\\b[\\s.,:;!\\-–—]*$`, "i");
  return value.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
}

function isLikelyProductItem(item: string): boolean {
  const lower = item.toLowerCase();
  if (!/[a-z]/i.test(item)) return false;
  if (/(pocket|stitch|hem|liner|lining|silhouette|button|seam|placket|gusset|thread|finish interior)/i.test(lower)) {
    return false;
  }
  return true;
}

const TZ_OFFSETS_SERVER: Record<string, number> = {
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

  const offset = tz && tz in TZ_OFFSETS_SERVER ? TZ_OFFSETS_SERVER[tz] : 0;
  const utcHour = ((hour - offset) % 24 + 24) % 24;

  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  date.setUTCHours(utcHour, 0, 0, 0);
  return date.toISOString();
}

function resolveReleaseDate(caption: string, aiReleaseDate: string | null, postDateIso: string | null, releaseTime: string | null = null): string | null {
  const explicitDates = extractDatesFromText(caption);
  if (explicitDates.length > 0) {
    if (!postDateIso) return mergeTimeIntoDate(explicitDates[0], releaseTime);

    const postDate = new Date(postDateIso);
    if (Number.isNaN(postDate.getTime())) return mergeTimeIntoDate(explicitDates[0], releaseTime);

    const nearest = explicitDates
      .map((date) => new Date(date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => Math.abs(a.getTime() - postDate.getTime()) - Math.abs(b.getTime() - postDate.getTime()))[0];

    return mergeTimeIntoDate(nearest ? nearest.toISOString() : explicitDates[0], releaseTime);
  }

  if (aiReleaseDate) {
    const parsedAiDate = new Date(aiReleaseDate);
    if (!Number.isNaN(parsedAiDate.getTime())) {
      // If AI already included time (non-midnight UTC), trust it
      const hasTime = parsedAiDate.getUTCHours() !== 0 || parsedAiDate.getUTCMinutes() !== 0;
      if (hasTime) {
        if (!postDateIso) return parsedAiDate.toISOString();
        const postDate = new Date(postDateIso);
        if (!Number.isNaN(postDate.getTime())) {
          const diffDays = Math.abs(parsedAiDate.getTime() - postDate.getTime()) / (24 * 60 * 60 * 1000);
          if (diffDays <= 45) return parsedAiDate.toISOString();
        }
      } else {
        if (!postDateIso) return mergeTimeIntoDate(parsedAiDate.toISOString(), releaseTime);
        const postDate = new Date(postDateIso);
        if (!Number.isNaN(postDate.getTime())) {
          const diffDays = Math.abs(parsedAiDate.getTime() - postDate.getTime()) / (24 * 60 * 60 * 1000);
          if (diffDays <= 45) return mergeTimeIntoDate(parsedAiDate.toISOString(), releaseTime);
        }
      }
    }
  }

  if (postDateIso && /(available now|ready to ship|in store now|out now)/i.test(caption)) {
    const postDate = new Date(postDateIso);
    if (!Number.isNaN(postDate.getTime())) return postDate.toISOString();
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apifyKey = Deno.env.get("APIFY_API_KEY");
    console.log("APIFY_API_KEY present:", !!apifyKey, "length:", apifyKey?.length, "prefix:", apifyKey?.slice(0, 10));
    if (!apifyKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Apify API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract Instagram handle from URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    let instagramHandle = "";
    try {
      const parsed = new URL(formattedUrl);
      if (parsed.hostname.includes("instagram.com")) {
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        instagramHandle = pathParts[0] || "";
      }
    } catch {
      instagramHandle = formattedUrl.replace("@", "").replace("https://", "").replace("http://", "");
    }

    if (!instagramHandle) {
      return new Response(
        JSON.stringify({ success: false, error: "Could not extract Instagram handle from URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profileUrl = `https://www.instagram.com/${instagramHandle}/`;
    console.log("Scraping Instagram profile via Apify:", profileUrl);

    // Run Apify Instagram Profile Scraper actor synchronously
    const actorRunResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernames: [instagramHandle],
          resultsLimit: 30,
        }),
      }
    );

    if (!actorRunResponse.ok) {
      const errText = await actorRunResponse.text();
      console.error("Apify error:", actorRunResponse.status, errText);
      return new Response(
        JSON.stringify({ success: false, error: `Apify error (${actorRunResponse.status}): ${errText.slice(0, 200)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apifyResults = await actorRunResponse.json();
    console.log("Apify returned", apifyResults.length, "results");

    if (!apifyResults || apifyResults.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No data found for this profile" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The profile scraper returns profile info + posts
    const profileData = apifyResults[0];
    const brandName = profileData.fullName || profileData.username || instagramHandle;
    const bio = profileData.biography || "";

    // Extract website URL from bio or profile
    const externalUrl = profileData.externalUrl || profileData.externalUrlShimmed || null;
    let websiteUrl = externalUrl;
    if (!websiteUrl) {
      // Try to find a URL in the bio text
      const urlMatch = bio.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/i);
      if (urlMatch) {
        websiteUrl = urlMatch[0].startsWith("http") ? urlMatch[0] : `https://${urlMatch[0]}`;
      }
    }

    // Extract latestPosts from profile data (Apify nests posts inside the profile object)
    const latestPosts = profileData.latestPosts || profileData.posts || [];
    console.log("Found", latestPosts.length, "latestPosts in profile data");
    // Also check if any top-level results are actual post items (have shortCode/caption but no username)
    const topLevelPosts = apifyResults.slice(1).filter((item: any) => item.shortCode || item.caption || item.text);
    const allPostItems = [...latestPosts, ...topLevelPosts];
    console.log("Total post items to process:", allPostItems.length);

    // Use AI to extract info from bio
    console.log("Extracting info from bio with AI...");
    const bioInfo = await extractWithAI(bio, brandName);
    console.log("Bio extraction:", JSON.stringify(bioInfo));

    // Parse posts with AI extraction (use extracted post items, not raw apify results)
    const posts = await parseApifyPosts(allPostItems, brandName);

    // If bio has release info, add as a synthetic post
    const bioHasMonthDateSignal = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(bio);
    const bioReleaseDate = bioHasMonthDateSignal ? resolveReleaseDate(bio, bioInfo.releaseDate, null, bioInfo.releaseTime) : null;
    if (bioReleaseDate || bioInfo.items.length > 0) {
      const bioSummary = stripBrandSuffix(bioInfo.summary || brandName, brandName) || brandName;
      const bioItems = bioInfo.items
        .map((item) => stripBrandSuffix(item, brandName))
        .filter(Boolean);
      const bioPrimaryItem = bioItems.find(isLikelyProductItem) || bioItems[0];
      const shouldAppendBioPrimary = Boolean(
        bioPrimaryItem && !normalizeForCompare(bioSummary).includes(normalizeForCompare(bioPrimaryItem))
      );

      const title = shouldAppendBioPrimary ? `${bioSummary}-${bioPrimaryItem}` : bioSummary;

      posts.unshift({
        url: profileUrl,
        caption: bio,
        imageUrl: profileData.profilePicUrl || profileData.profilePicUrlHD || null,
        type: "bio",
        productName: title,
        price: bioInfo.price || undefined,
        releaseDate: bioReleaseDate,
        rawContent: bio,
        postDate: new Date().toISOString(),
      });
    }

    console.log(`Found ${posts.length} posts (incl. bio) for ${brandName}`);

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey2);

    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .upsert({
        name: brandName,
        url: profileUrl,
        website_url: websiteUrl || null,
        logo_letter: brandName.slice(0, 2).toUpperCase(),
        instagram_handle: instagramHandle,
        bio: bio.slice(0, 500),
        is_monitoring: true,
      }, { onConflict: "instagram_handle" })
      .select()
      .single();

    if (brandError) {
      console.error("Error inserting brand:", brandError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save brand: " + brandError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert new posts and update existing posts so re-scrapes refresh stale extracted data
    if (posts.length > 0) {
      const { data: existingPosts } = await supabase
        .from("brand_posts")
        .select("id, post_url, post_type")
        .eq("brand_id", brand.id);

      const existingByUrl = new Map<string, { id: string }>();
      const existingBioIds: string[] = [];
      let existingBioId: string | null = null;
      const hasBioInCurrentRun = posts.some((post) => post.type === "bio");

      for (const row of existingPosts || []) {
        if (row.post_url) {
          if (!existingByUrl.has(row.post_url)) {
            existingByUrl.set(row.post_url, { id: row.id });
          }
        }

        if (row.post_type === "bio") {
          existingBioIds.push(row.id);
          if (!existingBioId) {
            existingBioId = row.id;
          }
        }
      }

      if (!hasBioInCurrentRun && existingBioIds.length > 0) {
        const { error: deleteBioError } = await supabase
          .from("brand_posts")
          .delete()
          .in("id", existingBioIds);

        if (deleteBioError) {
          console.error("Error deleting stale bio posts:", deleteBioError);
        }
      }

      const updates: Array<{
        id: string;
        data: {
          caption: string | null;
          image_url: string | null;
          post_type: string;
          extracted_product_name: string | null;
          extracted_price: string | null;
          extracted_release_date: string | null;
          raw_content: string | null;
          post_date: string | null;
        };
      }> = [];

      const inserts: Array<{
        brand_id: string;
        post_url: string | null;
        caption: string | null;
        image_url: string | null;
        post_type: string;
        extracted_product_name: string | null;
        extracted_price: string | null;
        extracted_release_date: string | null;
        raw_content: string | null;
        post_date: string | null;
      }> = [];

      for (const post of posts) {
        const record = {
          caption: post.caption || null,
          image_url: post.imageUrl || null,
          post_type: post.type || "post",
          extracted_product_name: post.productName || null,
          extracted_price: post.price || null,
          extracted_release_date: post.releaseDate || null,
          raw_content: post.rawContent || null,
          post_date: post.postDate || null,
        };

        if (post.url && existingByUrl.has(post.url)) {
          updates.push({ id: existingByUrl.get(post.url)!.id, data: record });
          continue;
        }

        if (post.type === "bio" && existingBioId) {
          updates.push({ id: existingBioId, data: record });
          continue;
        }

        inserts.push({
          brand_id: brand.id,
          post_url: post.url || null,
          ...record,
        });
      }

      if (updates.length > 0) {
        const updateResults = await Promise.all(
          updates.map(({ id, data }) => supabase.from("brand_posts").update(data).eq("id", id))
        );

        const failedUpdate = updateResults.find(({ error }) => !!error);
        if (failedUpdate?.error) {
          console.error("Error updating existing posts:", failedUpdate.error);
        }
      }

      if (inserts.length > 0) {
        const { error: postsError } = await supabase
          .from("brand_posts")
          .insert(inserts);

        if (postsError) {
          console.error("Error inserting posts:", postsError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        brand: {
          id: brand.id,
          name: brandName,
          handle: instagramHandle,
          bio,
          postsCount: posts.length,
        },
        posts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function parseApifyPosts(results: any[], brandName: string): Promise<Array<{
  url?: string;
  caption?: string;
  imageUrl?: string;
  type: string;
  productName?: string;
  price?: string;
  releaseDate?: string | null;
  rawContent?: string;
  postDate?: string | null;
}>> {
  const posts: any[] = [];

  // Process posts in parallel batches of 5 for AI extraction
  const items = results.filter(item => item.caption || item.text);
  const batchSize = 5;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const extractions = await Promise.all(
      batch.map(item => {
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

      // Determine visual type
      let type = "post";
      if (item.type === "Video" || item.isVideo) type = "reel";
      else if (item.type === "Sidecar") type = "carousel";

      const summaryBase = stripBrandSuffix(
        info.summary || info.productName || caption.split("\n")[0]?.trim().slice(0, 80) || "Post",
        brandName
      ) || "Post";

      const cleanItems = info.items
        .map((productItem) => stripBrandSuffix(productItem, brandName))
        .filter(Boolean);

      const primaryItem = cleanItems.find(isLikelyProductItem) || cleanItems[0];
      const shouldAppendPrimary = Boolean(
        primaryItem && !normalizeForCompare(summaryBase).includes(normalizeForCompare(primaryItem))
      );

      const productName = shouldAppendPrimary ? `${summaryBase}-${primaryItem}` : summaryBase;
      const resolvedReleaseDate = resolveReleaseDate(caption, info.releaseDate, postDateIso, info.releaseTime);

      posts.push({
        url: postUrl,
        caption: caption.slice(0, 500),
        imageUrl,
        type,
        productName,
        price: info.price || undefined,
        releaseDate: resolvedReleaseDate,
        rawContent: caption,
        postDate: postDateIso,
      });
    }
  }

  return posts.slice(0, 50);
}

/** Extract dates from any text (bio, caption, etc.) - used as fallback */
function extractDatesFromText(text: string): string[] {
  const dates: string[] = [];
  const currentYear = new Date().getFullYear();

  const patterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,.\s]+(\d{4}))?\b/gi,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,.\s]+(\d{4}))?\b/gi,
    
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      try {
        let parsed: Date;
        if (/^\d+$/.test(match[1])) {
          const month = parseInt(match[1]) - 1;
          const day = parseInt(match[2]);
          const year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : currentYear;
          parsed = new Date(year, month, day);
        } else {
          const dateStr = `${match[1]} ${match[2]} ${match[3] || currentYear}`;
          parsed = new Date(dateStr);
        }
        if (!isNaN(parsed.getTime())) {
          dates.push(parsed.toISOString());
        }
      } catch { /* ignore */ }
    }
  }

  return dates;
}
