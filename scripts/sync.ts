/** npm run sync -- <brand-slug>   Runs a sync in the terminal (handy for debugging a connection). */
import { Pool } from "pg";
import { runBrandSync } from "../src/lib/sync/run";

async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("Usage: npm run sync -- <brand-slug>");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query("select id from brands where slug = $1", [slug]);
  await pool.end();
  if (!rows[0]) throw new Error(`No brand ${slug}`);
  console.log(await runBrandSync(rows[0].id, "manual"));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
