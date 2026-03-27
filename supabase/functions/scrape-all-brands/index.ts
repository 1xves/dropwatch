import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all monitored brands
    const { data: brands, error } = await supabase
      .from("brands")
      .select("id, instagram_handle, name")
      .eq("is_monitoring", true);

    if (error) {
      console.error("Error fetching brands:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!brands || brands.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No brands to scrape" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Scraping ${brands.length} brand(s)...`);

    const results: Array<{ brand: string; success: boolean; error?: string }> = [];

    for (const brand of brands) {
      try {
        const profileUrl = `https://www.instagram.com/${brand.instagram_handle}/`;
        console.log(`Scraping ${brand.name} (${brand.instagram_handle})...`);

        // Keep existing posts intact; scrape-instagram handles insert/update safely.
        // This avoids destructive data loss when a scrape partially fails.

        // Call the existing scrape-instagram function
        const fnUrl = `${supabaseUrl}/functions/v1/scrape-instagram`;
        const response = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ url: profileUrl }),
        });

        const result = await response.json();
        results.push({
          brand: brand.name,
          success: result.success === true,
          error: result.error,
        });

        // Small delay between brands to avoid rate limits
        if (brands.length > 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err) {
        console.error(`Error scraping ${brand.name}:`, err);
        results.push({
          brand: brand.name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    console.log("Scrape results:", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results }),
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
