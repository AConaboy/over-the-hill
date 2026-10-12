import { cleanUp, migrate, sqlFile } from "./db";

// A known starting point: migrations applied, last run's QA data gone, the
// QA guests seeded fresh.
export default function globalSetup(): void {
  migrate();
  cleanUp();
  sqlFile("./seed.sql");
}
