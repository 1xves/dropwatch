import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shirt } from "lucide-react";
import BrandUrlInput from "@/components/BrandUrlInput";
import ReleaseCalendar from "@/components/ReleaseCalendar";
import UpcomingDrops from "@/components/UpcomingDrops";
import AlertsFeed from "@/components/AlertsFeed";
import TrackedBrands from "@/components/TrackedBrands";
import type { Brand } from "@/components/TrackedBrands";
import type { Release } from "@/components/ReleaseCalendar";
import type { Alert } from "@/components/AlertsFeed";
import { useToast } from "@/hooks/use-toast";
import {
  scrapeInstagramProfile,
  fetchBrands,
  fetchAllPosts,
  deleteBrand,
  postsToReleases,
  postsToAlerts,
} from "@/lib/api/instagram";

const Index = () => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      const [brandsData, postsData] = await Promise.all([
        fetchBrands(),
        fetchAllPosts(),
      ]);

      if (brandsData) {
        setBrands(
          brandsData.map((b: any) => ({
            id: b.id,
            name: b.name === b.name.toLowerCase()
              ? b.name.replace(/\b\w/g, (c: string) => c.toUpperCase())
              : b.name,
            url: b.url,
            logoLetter: b.logoLetter || b.logo_letter,
            bio: b.bio || undefined,
            websiteUrl: b.websiteUrl || b.website_url || undefined,
            releasesCount: postsData
              ? postsData.filter((p: any) => (p.brandId || p.brand_id) === b.id).length
              : 0,
            isMonitoring: b.isMonitoring ?? b.is_monitoring,
          }))
        );
      }

      if (postsData) {
        setReleases(postsToReleases(postsData as any));
        setAlerts(postsToAlerts(postsData as any));
      }
    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddBrand = async (url: string) => {
    setIsLoading(true);

    try {
      const result = await scrapeInstagramProfile(url);

      if (result.success && result.brand) {
        toast({
          title: "Brand added",
          description: `Scraped ${result.posts?.length || 0} posts from ${result.brand.name}. Now monitoring for releases.`,
        });

        // Reload all data from DB to get fresh releases & alerts
        await loadData();
      } else {
        toast({
          title: "Scrape failed",
          description: result.error || "Could not scrape this URL. Try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error scraping:", error);
      toast({
        title: "Error",
        description: "Failed to scrape the profile. Check the URL and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveBrand = async (id: string) => {
    try {
      await deleteBrand(id);
      await loadData();
    } catch (error) {
      console.error("Error removing brand:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-xl bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shirt className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-display font-bold text-gradient-gold">
              DROPWATCH
            </h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero input */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 py-4"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground">
            Never miss a <span className="text-gradient-gold">drop</span> again
          </h2>
          <p className="text-muted-foreground font-body max-w-lg mx-auto">
            Paste any clothing brand URL and we'll track releases, prices, restocks, and news — all in one calendar.
          </p>
          <div className="max-w-2xl mx-auto pt-2">
            <BrandUrlInput onAddBrand={handleAddBrand} isLoading={isLoading} />
          </div>
        </motion.div>

        {/* Dashboard grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Calendar */}
          <div className="lg:col-span-2 space-y-6">
            <ReleaseCalendar releases={releases} />
            <UpcomingDrops releases={releases} />
          </div>

          {/* Right column - Sidebar */}
          <div className="space-y-6">
            <TrackedBrands brands={brands} onRemove={handleRemoveBrand} onRefreshComplete={loadData} />
            <AlertsFeed alerts={alerts} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
