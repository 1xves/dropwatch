import { db, pool } from "./db.js";

const EXPERIMENT_FIVE_POST_ID = "d5a5bc80-a70d-43e0-b5a9-f0f29dc0ba03";
const CORRECT_RELEASE_DATE = "2026-03-21T00:00:00.000Z";

/**
 * Idempotent data fixes that run at server startup.
 * Safe to run multiple times — each operation checks preconditions first.
 */
export async function runDataMigrations() {
  try {
    await fixExperimentFiveMarchDate();
  } catch (err) {
    console.error("[dataMigrations] Failed:", err);
  }
}

/**
 * Fix #1: EXPERIMENT FIVE post was mis-extracted with date "2026-03-07"
 * (AI read "7PM GMT" as "March 7th"). Correct date is March 21st.
 * The combined product name "Henley hoodie + Daily denim V2" must also be
 * split into two separate brand_posts rows.
 */
async function fixExperimentFiveMarchDate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Rename the original post and set the correct date (predicate on ID only)
    const updateRes = await client.query(
      `UPDATE brand_posts
       SET extracted_release_date = $1,
           extracted_product_name = 'Henley hoodie'
       WHERE id = $2
         AND extracted_release_date <> $1`,
      [CORRECT_RELEASE_DATE, EXPERIMENT_FIVE_POST_ID]
    );
    if (updateRes.rowCount && updateRes.rowCount > 0) {
      console.log("[dataMigrations] Fixed EXPERIMENT FIVE March date → 2026-03-21");
    }

    // 2. Insert the "Daily denim V2" sibling if not already present
    const siblingCheck = await client.query(
      `SELECT id FROM brand_posts
       WHERE brand_id = (SELECT brand_id FROM brand_posts WHERE id = $1)
         AND extracted_product_name = 'Daily denim V2'
         AND extracted_release_date = $2`,
      [EXPERIMENT_FIVE_POST_ID, CORRECT_RELEASE_DATE]
    );

    if (siblingCheck.rowCount === 0) {
      await client.query(
        `INSERT INTO brand_posts
           (brand_id, post_url, image_url, caption, post_date,
            post_type, extracted_product_name, extracted_price,
            extracted_release_date, raw_content)
         SELECT
           brand_id, post_url, image_url, caption, post_date,
           post_type, 'Daily denim V2', extracted_price,
           $1, raw_content
         FROM brand_posts
         WHERE id = $2`,
        [CORRECT_RELEASE_DATE, EXPERIMENT_FIVE_POST_ID]
      );
      console.log("[dataMigrations] Inserted Daily denim V2 sibling post for March 21");
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
