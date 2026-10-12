import { cleanUp } from "./db";

// Leave the local database as it was (bar anything a failed test left for
// looking at: rerunning cleans that up too).
export default function globalTeardown(): void {
  if (!process.env.QA_KEEP_DATA) cleanUp();
}
