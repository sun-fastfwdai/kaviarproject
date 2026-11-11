import "server-only";
import { shopifyGraphql } from "./client";

const RUN = `mutation Run($q: String!) {
  bulkOperationRunQuery(query: $q) { bulkOperation { id status } userErrors { field message } }
}`;
const POLL = `query Poll($id: ID!) {
  node(id: $id) { ... on BulkOperation { id status errorCode objectCount url partialDataUrl } }
}`;

type BulkOp = { id: string; status: string; errorCode: string | null; objectCount: string; url: string | null; partialDataUrl: string | null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a bulk query and waits for it. Bulk operations skip the per-query cost limit, so a 2-year
 * order history comes down as one JSONL file instead of thousands of paged calls.
 */
export async function runBulkQuery(connectionId: string, query: string, timeoutMs = 25 * 60_000): Promise<string | null> {
  const started = await shopifyGraphql<{
    bulkOperationRunQuery: { bulkOperation: { id: string } | null; userErrors: { message: string }[] };
  }>(connectionId, RUN, { q: query });
  const op = started.bulkOperationRunQuery;
  if (!op.bulkOperation) throw new Error(`Bulk query rejected: ${op.userErrors.map((e) => e.message).join("; ")}`);

  const deadline = Date.now() + timeoutMs;
  for (let i = 0; Date.now() < deadline; i++) {
    await sleep(Math.min(1000 * (i + 1), 8000));
    const { node } = await shopifyGraphql<{ node: BulkOp | null }>(connectionId, POLL, { id: op.bulkOperation.id });
    if (!node) throw new Error("Bulk operation disappeared");
    if (node.status === "COMPLETED") return node.url; // null when nothing matched
    if (["FAILED", "CANCELED", "EXPIRED"].includes(node.status)) {
      throw new Error(`Bulk operation ${node.status.toLowerCase()}${node.errorCode ? `: ${node.errorCode}` : ""}`);
    }
  }
  throw new Error("Bulk operation timed out");
}

/** Streams a JSONL result file, handing records over in batches. */
export async function readJsonl(url: string, onBatch: (rows: Record<string, unknown>[]) => Promise<void>, batchSize = 500) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`Could not download bulk result (${res.status})`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let batch: Record<string, unknown>[] = [];
  const push = async (line: string) => {
    if (!line.trim()) return;
    batch.push(JSON.parse(line));
    if (batch.length >= batchSize) {
      const b = batch;
      batch = [];
      await onBatch(b);
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      await push(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  await push(buf);
  if (batch.length) await onBatch(batch);
}
