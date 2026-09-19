import { MongoClient, ServerApiVersion } from "mongodb";

type SourceDocument = { _id: string; content: string; createdAt: Date };
type EvidenceDocument = { _id: string; url: string; title: string; excerpt: string; createdAt: Date };

const globalForMongo = globalThis as unknown as { mongoClientPromise?: Promise<MongoClient> };

async function mongoDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  globalForMongo.mongoClientPromise ??= new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    serverSelectionTimeoutMS: 10_000,
  }).connect().catch((error) => { globalForMongo.mongoClientPromise = undefined; throw error; });
  const client = await globalForMongo.mongoClientPromise;
  return client.db(process.env.MONGODB_DB ?? "underwriting_agent");
}

export async function putMongoText(key: string, content: string): Promise<boolean> {
  const database = await mongoDatabase();
  if (!database) return false;
  const collection = database.collection<SourceDocument>("source_documents");
  await collection.updateOne({ _id: key }, { $setOnInsert: { content, createdAt: new Date() } }, { upsert: true });
  const saved = await collection.findOne({ _id: key });
  if (saved?.content !== content) throw new Error(`Source document ${key} already has different content`);
  return true;
}

export async function getMongoText(key: string): Promise<string | null> {
  const database = await mongoDatabase();
  if (!database) return null;
  const document = await database.collection<SourceDocument>("source_documents").findOne({ _id: key });
  return document?.content ?? null;
}

export async function putMongoEvidence(caseId: string, evidence: { url: string; title: string; excerpt: string }): Promise<void> {
  const database = await mongoDatabase();
  if (!database) return;
  await database.collection<EvidenceDocument>("public_evidence").updateOne(
    { _id: caseId },
    { $set: { ...evidence, createdAt: new Date() } },
    { upsert: true },
  );
}
