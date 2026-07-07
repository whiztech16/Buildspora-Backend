import { db } from "../src/db";
import { projects } from "../src/db/schema";
async function run() {
  const all = await db.select().from(projects);
  console.log(JSON.stringify(all, null, 2));
  process.exit(0);
}
run();
