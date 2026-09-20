import { MongoClient, ServerApiVersion } from "mongodb";
import { CASE_MEMORY_COLLECTION, CASE_MEMORY_INDEX, EMBEDDING_DIMENSIONS, type CaseMemory, type CaseMemoryStore } from "./case-memory";
import { mongoUri } from "./env";

type SourceDocument = { _id: string; content: string; createdAt: Date };
type EvidenceDocument = { _id: string; url: string; title: string; excerpt: string; createdAt: Date };

const globalForMongo = globalThis as unknown as { mongoClientPromise?: Promise<MongoClient> };

async function mongoDatabase() {
  const uri = mongoUri();
  // Stable API V1 without strict mode: Atlas Search stages such as `$vectorSearch` (case_memory) are outside the Stable API and are rejected under strict.
  globalForMongo.mongoClientPromise ??= new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true },
    serverSelectionTimeoutMS: 10_000,
  }).connect().catch((error) => { globalForMongo.mongoClientPromise = undefined; throw error; });
  const client = await globalForMongo.mongoClientPromise;
  return client.db(process.env.MONGODB_DB ?? "underwriting_agent");
}

export async function putMongoText(key: string, content: string): Promise<void> {
  const database = await mongoDatabase();
  const collection = database.collection<SourceDocument>("source_documents");
  await collection.updateOne({ _id: key }, { $setOnInsert: { content, createdAt: new Date() } }, { upsert: true });
  const saved = await collection.findOne({ _id: key });
  if (saved?.content !== content) throw new Error(`Source document ${key} already has different content`);
}

export async function getMongoText(key: string): Promise<string | null> {
  const database = await mongoDatabase();
  const document = await database.collection<SourceDocument>("source_documents").findOne({ _id: key });
  return document?.content ?? null;
}

export async function putMongoEvidence(caseId: string, evidence: { url: string; title: string; excerpt: string }): Promise<void> {
  const database = await mongoDatabase();
  await database.collection<EvidenceDocument>("public_evidence").updateOne(
    { _id: caseId },
    { $set: { ...evidence, createdAt: new Date() } },
    { upsert: true },
  );
}

type CaseMemoryDocument = Omit<CaseMemory, "caseId"> & { _id: string };

/** The Atlas Vector Search index over `case_memory`, exactly as docs/deployment.md lists it. Dimensions follow the embedding model. */
export const CASE_MEMORY_INDEX_DEFINITION = {
  fields: [
    { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
    { type: "filter", path: "status" },
  ],
} as const;

/**
 * Creates the vector index when the server supports search indexes and it is missing. Returns the
 * index status ("READY", "BUILDING", ...) or "unsupported" on local MongoDB, which has no search indexes.
 */
export async function ensureCaseMemoryIndex(): Promise<{ status: string; created: boolean }> {
  const collection = (await mongoDatabase()).collection<CaseMemoryDocument>(CASE_MEMORY_COLLECTION);
  const status = async () => (await collection.listSearchIndexes(CASE_MEMORY_INDEX).toArray() as { name: string; status?: string }[])[0];
  try {
    const existing = await status();
    if (existing) return { status: existing.status ?? "unknown", created: false };
    await collection.createSearchIndex({ name: CASE_MEMORY_INDEX, type: "vectorSearch", definition: CASE_MEMORY_INDEX_DEFINITION });
    return { status: (await status())?.status ?? "BUILDING", created: true };
  } catch (error) {
    if (noSearchHere(error)) return { status: "unsupported", created: false };
    throw error;
  }
}

/** Remembered once per process: local MongoDB will not grow a `$vectorSearch` stage, so there is no point asking it again. */
let vectorStageUnsupported: string | null = null;

/** Local MongoDB rejects Atlas Search stages and commands with 6047401 ("only allowed on MongoDB Atlas"); older builds with 40324 (unrecognised stage) or 59/115 (unknown command). */
function noSearchHere(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : "";
  return code === 6047401 || code === 40324 || code === 59 || code === 115 || /only allowed on MongoDB Atlas|Unrecognized pipeline stage/i.test(message);
}

const fromDocument = ({ _id, ...rest }: CaseMemoryDocument): CaseMemory => ({ caseId: _id, ...rest });

/**
 * The `case_memory` collection behind similar-cases.ts: one document per case, keyed by case id,
 * holding the briefing embedding and how the case ended. `vectorSearch` is Atlas Vector Search over
 * the index in docs/deployment.md and throws anywhere that index does not exist; the caller then
 * ranks in-app over `listDecided`.
 */
export function caseMemoryStore(): CaseMemoryStore & { remove(caseIds: string[]): Promise<void> } {
  const collection = async () => (await mongoDatabase()).collection<CaseMemoryDocument>(CASE_MEMORY_COLLECTION);
  return {
    async get(caseId) {
      const document = await (await collection()).findOne({ _id: caseId });
      return document ? fromDocument(document) : null;
    },
    async upsert({ caseId, ...memory }) {
      await (await collection()).updateOne({ _id: caseId }, { $set: memory }, { upsert: true });
    },
    async listDecided(excludeId) {
      const documents = await (await collection()).find({ _id: { $ne: excludeId }, status: { $in: ["approved", "declined"] } }).toArray();
      return documents.map(fromDocument);
    },
    async vectorSearch(embedding, k, excludeId) {
      if (vectorStageUnsupported) throw Object.assign(new Error(vectorStageUnsupported), { code: 6047401 });
      try {
        const documents = await (await collection()).aggregate<Omit<CaseMemoryDocument, "embedding"> & { score: number }>([
          { $vectorSearch: { index: CASE_MEMORY_INDEX, path: "embedding", queryVector: embedding, numCandidates: Math.max(50, k * 20), limit: k + 1, filter: { status: { $in: ["approved", "declined"] } } } },
          { $addFields: { score: { $meta: "vectorSearchScore" } } },
          { $project: { embedding: 0 } },
        ]).toArray();
        return documents.filter((document) => document._id !== excludeId).map(({ _id, score, ...rest }) => ({ caseId: _id, ...rest, score: Math.round(score * 10_000) / 10_000 }));
      } catch (error) {
        if (noSearchHere(error)) vectorStageUnsupported = error instanceof Error ? error.message : "$vectorSearch stage is only allowed on MongoDB Atlas";
        throw error;
      }
    },
    async remove(caseIds) {
      await (await collection()).deleteMany({ _id: { $in: caseIds } });
    },
  };
}
