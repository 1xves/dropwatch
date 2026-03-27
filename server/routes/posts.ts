import { Router } from "express";
import { db } from "../db.js";
import { brandPosts, brands } from "../../shared/schema.js";
import { desc, eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: brandPosts.id,
        brandId: brandPosts.brandId,
        postUrl: brandPosts.postUrl,
        imageUrl: brandPosts.imageUrl,
        caption: brandPosts.caption,
        postDate: brandPosts.postDate,
        postType: brandPosts.postType,
        extractedProductName: brandPosts.extractedProductName,
        extractedPrice: brandPosts.extractedPrice,
        extractedReleaseDate: brandPosts.extractedReleaseDate,
        extractedListedItems: brandPosts.extractedListedItems,
        rawContent: brandPosts.rawContent,
        createdAt: brandPosts.createdAt,
        brands: {
          name: brands.name,
          websiteUrl: brands.websiteUrl,
        },
      })
      .from(brandPosts)
      .leftJoin(brands, eq(brandPosts.brandId, brands.id))
      .orderBy(desc(brandPosts.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:brandId", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(brandPosts)
      .where(eq(brandPosts.brandId, req.params.brandId))
      .orderBy(desc(brandPosts.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
