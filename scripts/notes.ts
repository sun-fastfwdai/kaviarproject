/** npm run notes -- <brand-slug>   Rewrites the agents' notes for a brand and prints them. */
import { Pool } from "pg";
import { getNotes, refreshNotes } from "../src/lib/ai/notes";

async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("Usage: npm run notes -- <brand-slug>");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query("select id from brands where slug = $1", [slug]);
  await pool.end();
  if (!rows[0]) throw new Error(`No brand ${slug}`);
  const t = Date.now();
  await refreshNotes(rows[0].id);
  console.log(`Notes for ${slug} (${Math.round((Date.now() - t) / 1000)}s):`);
  console.log(JSON.stringify(await getNotes(rows[0].id), null, 2));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
