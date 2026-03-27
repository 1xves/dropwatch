import { addDays, addHours } from "date-fns";
import type { Release } from "@/components/ReleaseCalendar";
import type { Alert } from "@/components/AlertsFeed";
import type { Brand } from "@/components/TrackedBrands";

const now = new Date();

export const mockBrands: Brand[] = [
  { id: "1", name: "Nike", url: "https://nike.com", logoLetter: "N", releasesCount: 4, isMonitoring: true },
  { id: "2", name: "Supreme", url: "https://supremenewyork.com", logoLetter: "S", releasesCount: 2, isMonitoring: true },
  { id: "3", name: "Stüssy", url: "https://stussy.com", logoLetter: "St", releasesCount: 1, isMonitoring: false },
];

export const mockReleases: Release[] = [
  { id: "r1", brand: "Nike", name: "Air Max 1 'Obsidian'", date: addDays(now, 3), price: "160", type: "drop" },
  { id: "r2", brand: "Supreme", name: "Box Logo Hoodie FW25", date: addDays(now, 7), price: "168", type: "drop" },
  { id: "r3", brand: "Nike", name: "Dunk Low x Off-White", date: addDays(now, 12), price: "220", type: "collab" },
  { id: "r4", brand: "Stüssy", name: "Washed Canvas Cap", date: addDays(now, 5), price: "48", type: "drop" },
  { id: "r5", brand: "Nike", name: "Air Force 1 Restock", date: addDays(now, 1), price: "110", type: "restock" },
  { id: "r6", brand: "Supreme", name: "Week 8 Drop", date: addDays(now, 14), price: "TBD", type: "drop" },
];

export const mockAlerts: Alert[] = [
  { id: "a1", brand: "Nike", message: "Air Max 1 'Obsidian' price confirmed at $160", type: "price_change", timestamp: addHours(now, -2) },
  { id: "a2", brand: "Supreme", message: "FW25 lookbook released — Box Logo confirmed", type: "news", timestamp: addHours(now, -5) },
  { id: "a3", brand: "Nike", message: "Air Force 1 restock dropping tomorrow at 10AM EST", type: "restock", timestamp: addHours(now, -8) },
  { id: "a4", brand: "Nike", message: "New Off-White collaboration announced for next month", type: "new_release", timestamp: addDays(now, -1) },
  { id: "a5", brand: "Stüssy", message: "New seasonal collection dropping this week", type: "news", timestamp: addDays(now, -1) },
];
