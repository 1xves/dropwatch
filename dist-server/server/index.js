import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import brandsRouter from "./routes/brands.js";
import postsRouter from "./routes/posts.js";
import scrapeRouter from "./routes/scrape.js";
import { runDataMigrations } from "./dataMigrations.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
await runDataMigrations();
app.use(express.json());
app.use("/api/brands", brandsRouter);
app.use("/api/posts", postsRouter);
app.use("/api/scrape", scrapeRouter);
if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "../dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });
}
const server = createServer(app);
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
export default app;
