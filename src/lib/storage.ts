import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getMongoText, putMongoText } from "./mongo";

const globalForStorage = globalThis as unknown as { s3Client?: S3Client };
function s3Client(): S3Client {
  if (globalForStorage.s3Client) return globalForStorage.s3Client;
  if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) throw new Error("S3 credentials are required for legacy source documents");
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  });
  if (process.env.NODE_ENV !== "production") globalForStorage.s3Client = client;
  return client;
}

const bucket = process.env.S3_BUCKET ?? "underwriting-submissions";
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  try {
    await s3Client().send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
    try {
      await s3Client().send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (createError) {
      if ((createError as { name?: string }).name !== "BucketAlreadyOwnedByYou") throw createError;
    }
  }
  bucketReady = true;
}

export async function putText(key: string, content: string) {
  if (await putMongoText(key, content)) return;
  await ensureBucket();
  await s3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: content, ContentType: "text/plain; charset=utf-8" }));
}

export async function getText(key: string): Promise<string> {
  const mongoText = await getMongoText(key);
  if (mongoText !== null) return mongoText;
  const result = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error(`Object ${key} is empty`);
  return result.Body.transformToString();
}
