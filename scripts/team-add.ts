/** npm run team:add -- --email jina@kaviar.ai --name Jina [--owner]  → prints a one-time password. */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !name) throw new Error("Usage: npm run team:add -- --email you@kaviar.ai --name You [--owner]");
  const password = randomBytes(12).toString("base64url");
  const salt = randomBytes(16);
  const hash = (await promisify(scrypt)(password.normalize("NFKC"), salt, 64)) as Buffer;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `insert into members (email, name, role, password_hash) values ($1, $2, $3, $4)
     on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash`,
    [email, name, process.argv.includes("--owner") ? "owner" : "operator", `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`],
  );
  await pool.end();
  console.log(`${name} <${email}> can sign in with: ${password}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
