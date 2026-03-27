import { Router } from "express";
import { db } from "../db.js";
import { brands } from "../../shared/schema.js";
import { eq, desc } from "drizzle-orm";
const router = Router();
router.get("/", async (_req, res) => {
    try {
        const rows = await db.select().from(brands).orderBy(desc(brands.createdAt));
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        await db.delete(brands).where(eq(brands.id, req.params.id));
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
export default router;
