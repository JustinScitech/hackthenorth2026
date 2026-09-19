import { getMongoText, putMongoText } from "./mongo";

export async function putText(key: string, content: string) {
  await putMongoText(key, content);
}

export async function getText(key: string): Promise<string> {
  const mongoText = await getMongoText(key);
  if (mongoText === null) throw new Error(`Source document ${key} is missing from MongoDB`);
  return mongoText;
}
