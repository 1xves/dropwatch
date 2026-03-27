import { useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import type { Release } from "./ReleaseCalendar";
import { getDisplayItems, stripBrandFromItem } from "@/lib/releaseUtils";

interface UpcomingDropsProps {
  releases: Release[];
}

const typeBadge: Record<string, string> = {
  drop: "bg-drop-hot/20 text-drop-hot",
  restock: "bg-drop-soon/20 text-drop-soon",
  collab: "bg-drop-upcoming/20 text-drop-upcoming",
  event: "bg-emerald-500/20 text-emerald-500",
};

const tabs = [
  { key: "all", label: "All" },
  { key: "drop", label: "Drops" },
  { key: "restock", label: "Restocks" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const UpcomingDrops = ({ releases }: UpcomingDropsProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sorted = [...releases].sort((a, b) => a.date.getTime() - b.date.getTime());
  const upcoming = sorted.filter((r) => r.date >= today);
  const filtered = activeTab === "all" ? upcoming : upcoming.filter((r) => r.type === activeTab);
  const display = filtered.slice(0, 8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass-card rounded-2xl p-6 w-fit"
    >
      <h2 className="text-lg font-display font-bold mb-4 text-foreground" data-testid="text-upcoming-drops-title">
        Upcoming Drops
      </h2>

      <div className="flex gap-1 mb-4 p-1 bg-secondary/50 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`button-tab-${tab.key}`}
            className={`px-3 py-1.5 text-xs font-display font-medium rounded-md transition-all ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {display.length === 0 ? (
        <p className="text-muted-foreground text-sm font-body">
          No upcoming {activeTab === "all" ? "releases" : `${activeTab}s`}. Add a brand to start tracking.
        </p>
      ) : (
        <div className="space-y-3 w-fit">
          {display.map((release, i) => {
            const { filteredItems, hideRedundantTitle, displayTitle } = getDisplayItems(release.items, release.name, release.brand);
            const showInlinePrice = release.type !== "event" && release.price && release.price !== "TBD";

            return (
              <motion.div
                key={release.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group cursor-pointer"
                data-testid={`card-upcoming-drop-${release.id}`}
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <span className="text-sm font-display font-bold text-muted-foreground">
                    {release.brand[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-semibold truncate text-foreground" data-testid={`text-brand-${release.id}`}>{release.brand}</p>
                  {!hideRedundantTitle && (
                    <p className="text-xs text-muted-foreground font-body" data-testid={`text-title-${release.id}`}>{displayTitle}</p>
                  )}
                  {(filteredItems.length > 0 || showInlinePrice || release.availableOnline) && (
                    <div className="mt-0.5 space-y-0.5">
                      {filteredItems.map((item, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground font-body truncate" data-testid={`text-item-${release.id}-${idx}`}>
                          {item}
                          {showInlinePrice && (
                            <span className="ml-1.5 font-semibold text-primary">
                              ${release.price.replace(/^\$/, "").replace(/\s*usd\s*/gi, "").trim()}
                            </span>
                          )}
                        </p>
                      ))}
                      {filteredItems.length === 0 && showInlinePrice && (
                        <p className="text-xs font-semibold text-primary">
                          ${release.price.replace(/^\$/, "").replace(/\s*usd\s*/gi, "").trim()} USD
                        </p>
                      )}
                      {release.availableOnline && (
                        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium" data-testid={`badge-online-${release.id}`}>
                          Available Online
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${typeBadge[release.type]}`} data-testid={`badge-type-${release.id}`}>
                    {release.type}
                  </span>
                  <p className="text-xs text-muted-foreground font-display" data-testid={`text-date-${release.id}`}>
                    {format(release.date, "MMM d")}
                  </p>
                  {release.releaseTime && (
                    <p className="text-[10px] text-muted-foreground">
                      {release.releaseTime}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default UpcomingDrops;
