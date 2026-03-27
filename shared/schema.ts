import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  logoLetter: text("logo_letter").notNull(),
  instagramHandle: text("instagram_handle").unique(),
  bio: text("bio"),
  websiteUrl: text("website_url"),
  isMonitoring: boolean("is_monitoring").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brandPosts = pgTable("brand_posts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  postUrl: text("post_url"),
  imageUrl: text("image_url"),
  caption: text("caption"),
  postDate: timestamp("post_date", { withTimezone: true }),
  postType: text("post_type").default("post"),
  extractedProductName: text("extracted_product_name"),
  extractedPrice: text("extracted_price"),
  extractedReleaseDate: timestamp("extracted_release_date", { withTimezone: true }),
  extractedListedItems: text("extracted_listed_items").array(),
  rawContent: text("raw_content"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Brand = typeof brands.$inferSelect;
export type InsertBrand = typeof brands.$inferInsert;
export type BrandPost = typeof brandPosts.$inferSelect;
export type InsertBrandPost = typeof brandPosts.$inferInsert;
