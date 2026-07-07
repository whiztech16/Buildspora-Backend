import { db } from '../src/db'; 
import { projects, milestones } from '../src/db/schema'; 
import { eq } from 'drizzle-orm'; 

async function run() { 
  const p = await db.query.projects.findFirst({ where: eq(projects.id, '445466e8-d028-41d5-ad68-41eb5a880f2a') }); 
  console.log(p); 
  const m = await db.query.milestones.findMany({ where: eq(milestones.projectId, '445466e8-d028-41d5-ad68-41eb5a880f2a') }); 
  console.log(m); 
  process.exit(0); 
} 
run();
