import "dotenv/config";
import { db } from "./src/db";
import { projects, milestones, milestoneImages, siteCheckIns, users } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  try {
    const emptyProjectId = "a7712d58-f9d9-45dd-84a2-564ecb53818b";

    const contractor = await db.query.users.findFirst({
      where: eq(users.email, "ssgstoresnoreply@gmail.com")
    });

    if (!contractor) {
      console.log("Contractor not found");
      process.exit(1);
    }

    const milestone = await db.query.milestones.findFirst({
      where: eq(milestones.projectId, emptyProjectId)
    });

    if (!milestone) {
      console.log("No milestone found for project");
      process.exit(1);
    }
    const emptyMilestoneId = milestone.id;

    // 1. Ensure the project has the contractor
    await db.update(projects).set({ contractorId: contractor.id }).where(eq(projects.id, emptyProjectId));

    // 2. Add a check-in
    await db.delete(siteCheckIns).where(eq(siteCheckIns.milestoneId, emptyMilestoneId));
    await db.insert(siteCheckIns).values({
      milestoneId: emptyMilestoneId,
      contractorId: contractor.id,
      checkInTime: new Date(Date.now() - 3600000), // 1 hour ago
      checkInLat: "6.5244",
      checkInLng: "3.3792",
      checkInLocation: "Warri South, Delta State, 332232, Nigeria",
      checkOutTime: new Date(),
      checkOutLat: "6.5244",
      checkOutLng: "3.3792",
      checkOutLocation: "Warri South, Delta State, 332232, Nigeria",
    });

    // 3. Add a photo
    await db.delete(milestoneImages).where(eq(milestoneImages.milestoneId, emptyMilestoneId));
    await db.insert(milestoneImages).values({
      milestoneId: emptyMilestoneId,
      uploadedBy: contractor.id,
      storageUrl: "https://images.unsplash.com/photo-1541888081631-f1eb982ed301?auto=format&fit=crop&w=800&q=80",
      lat: "6.5244",
      lng: "3.3792",
      locationName: "Warri South, Delta State, 332232, Nigeria",
      takenAt: new Date(),
    });

    console.log("Successfully copied data to the empty project!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
