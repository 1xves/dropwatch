import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Clock } from "lucide-react";
import { getDisplayItems, stripBrandFromItem } from "@/lib/releaseUtils";
import { Button } from "@/components/ui/button";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";

export interface Release {
  id: string;
  brand: string;
  name: string;
  date: Date;
  price: string;
  type: "drop" | "restock" | "collab" | "event";
  imageUrl?: string;
  source?: string;
  items?: string[];
  releaseTime?: string;
  availableOnline?: boolean;
}

interface ReleaseCalendarProps {
  releases: Release[];
  onSelectDate?: (date: Date) => void;
}

const typeColors: Record<string, string> = {
  drop: "bg-drop-hot",
  restock: "bg-drop-soon",
  collab: "bg-drop-upcoming",
  event: "bg-emerald-500",
};

const typeBadge: Record<string, string> = {
  drop: "bg-drop-hot/20 text-drop-hot",
  restock: "bg-drop-soon/20 text-drop-soon",
  collab: "bg-drop-upcoming/20 text-drop-upcoming",
  event: "bg-emerald-500/20 text-emerald-500",
};

const ReleaseCalendar = ({ releases, onSelectDate }: ReleaseCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getReleasesForDay = (day: Date) =>
    releases.filter((r) => isSameDay(r.date, day));

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setShowPopup(true);
    onSelectDate?.(day);
  };

  const selectedDayReleases = selectedDate ? getReleasesForDay(selectedDate) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-card rounded-2xl p-6 relative"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-bold text-gradient-gold">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-display font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const dayReleases = getReleasesForDay(day);
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = selectedDate && isSameDay(day, selectedDate);

          return (
            <button
              key={i}
              onClick={() => handleDayClick(day)}
              className={`
                relative p-2 h-16 rounded-lg text-sm font-body transition-all
                ${inMonth ? "text-foreground" : "text-muted-foreground/40"}
                ${today ? "ring-1 ring-primary/50" : ""}
                ${selected ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-secondary/50"}
              `}
            >
              <span className={`${today ? "font-bold text-primary" : ""}`}>
                {format(day, "d")}
              </span>
              {dayReleases.length > 0 && (
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {dayReleases.slice(0, 3).map((r, idx) => (
                    <span
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full ${typeColors[r.type]}`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-drop-hot" /> Drop
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-drop-soon" /> Restock
        </div>
      </div>

      <AnimatePresence>
        {showPopup && selectedDate && (
          <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-20"
            onClick={() => setShowPopup(false)}
            data-testid="popup-backdrop"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="absolute left-4 right-auto bottom-4 top-auto z-30 bg-background border border-border rounded-xl shadow-2xl p-4 overflow-y-auto w-fit max-w-[90%] max-h-[300px]"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-foreground">
                {format(selectedDate, "EEEE, MMMM d")}
              </h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPopup(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {selectedDayReleases.length === 0 ? (
              <p className="text-sm text-muted-foreground font-body">No drops scheduled for this day.</p>
            ) : (
              <div className="space-y-3">
                {selectedDayReleases.map((release) => {
                  const { filteredItems, hideRedundantTitle, displayTitle } = getDisplayItems(release.items, release.name, release.brand);

                  return (
                    <div key={release.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        <span className="text-sm font-display font-bold text-muted-foreground">
                          {release.brand[0]}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-semibold truncate text-foreground">{release.brand}</p>
                        {!hideRedundantTitle && (
                          <p className="text-xs text-muted-foreground font-body">{displayTitle}</p>
                        )}
                        {(() => {
                          const showInlinePrice = release.type !== "event" && release.price && release.price !== "TBD";
                          return (filteredItems.length > 0 || showInlinePrice || release.availableOnline) ? (
                            <div className="mt-0.5 space-y-0.5">
                              {filteredItems.map((item, idx) => (
                                <p key={idx} className="text-xs text-muted-foreground font-body truncate">
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
                                <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">
                                  Available Online
                                </span>
                              )}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${typeBadge[release.type]}`}>
                          {release.type}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {release.releaseTime || format(release.date, "h:mm a")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ReleaseCalendar;
