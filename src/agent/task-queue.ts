import { DEFAULT_TASK_QUEUE } from "./contracts";

export const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? DEFAULT_TASK_QUEUE;
