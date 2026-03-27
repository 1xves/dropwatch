import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface BrandUrlInputProps {
  onAddBrand: (url: string) => void;
  isLoading?: boolean;
}

const BrandUrlInput = ({ onAddBrand, isLoading }: BrandUrlInputProps) => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAddBrand(url.trim());
      setUrl("");
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="glass-card rounded-2xl p-2 flex items-center gap-2 glow-gold">
        <div className="flex items-center gap-3 flex-1 px-3">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste brand URL — website or social media..."
            className="border-0 bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 text-base font-body"
          />
        </div>
        <Button
          type="submit"
          disabled={!url.trim() || isLoading}
          className="rounded-xl px-6 h-12 font-display font-semibold text-sm tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              Track
            </>
          )}
        </Button>
      </div>
    </motion.form>
  );
};

export default BrandUrlInput;
