import { useState } from "react";
import { motion } from "framer-motion";
import { X, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scrapeAllBrands } from "@/lib/api/instagram";
import { toast } from "sonner";

export interface Brand {
  id: string;
  name: string;
  url: string;
  websiteUrl?: string;
  logoLetter: string;
  bio?: string;
  releasesCount: number;
  isMonitoring: boolean;
}

interface TrackedBrandsProps {
  brands: Brand[];
  onRemove: (id: string) => void;
  onRefreshComplete?: () => void;
}

const TrackedBrands = ({ brands, onRemove, onRefreshComplete }: TrackedBrandsProps) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    toast.info("Re-scraping all brands…");
    try {
      const result = await scrapeAllBrands();
      if (!result.success) throw new Error(result.error || "Scrape failed");
      toast.success("Scrape complete — data refreshed!");
      onRefreshComplete?.();
    } catch (err: any) {
      toast.error("Scrape failed: " + (err.message || "Unknown error"));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-bold text-foreground">
          Tracked Brands
        </h2>
        {brands.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Scraping…" : "Refresh"}
          </Button>
        )}
      </div>

      {brands.length === 0 ? (
        <p className="text-muted-foreground text-sm font-body">
          No brands tracked yet.
        </p>
      ) : (
        <div className="space-y-2">
          {brands.map((brand) => (
            <div
              key={brand.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 group cursor-pointer hover:bg-secondary transition-colors"
              onClick={() => window.open(brand.websiteUrl || brand.url, "_blank", "noopener,noreferrer")}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-display font-bold text-primary">
                  {brand.logoLetter}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-semibold truncate text-foreground">
                  {brand.name}
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" asChild>
                  <a href={brand.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(brand.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default TrackedBrands;
