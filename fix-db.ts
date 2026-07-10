import "dotenv/config";
import { db } from "./src/db";
import { notifications, milestones, milestoneImages, projects } from "./src/db/schema";
import { eq, like } from "drizzle-orm";

async function run() {
  try {
    // 1. Fix all broken notification links
    const badNotifs = await db.query.notifications.findMany({
      where: like(notifications.linkTo, "/client/projects/%")
    });

    for (const notif of badNotifs) {
      if (notif.linkTo) {
        const fixedLink = notif.linkTo.replace("/client/projects/", "/dashboard/client/project/");
        await db.update(notifications)
          .set({ linkTo: fixedLink })
          .where(eq(notifications.id, notif.id));
      }
    }
    console.log(`Fixed ${badNotifs.length} broken notification links.`);

    // 2. Inject a mock image into the "Land Secured" milestone so it's visible
    const landSecured = await db.query.milestones.findFirst({
      where: eq(milestones.name, "Land Secured")
    });

    if (landSecured) {
      // Find the project contractor
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, landSecured.projectId)
      });
      
      const uploaderId = project?.contractorId || project?.clientId; // Just fallback to someone

      if (uploaderId) {
        // Clear any existing just in case
        await db.delete(milestoneImages).where(eq(milestoneImages.milestoneId, landSecured.id));
        
        // Insert a beautiful site photo
        await db.insert(milestoneImages).values({
          milestoneId: landSecured.id,
          uploadedBy: uploaderId,
          storageUrl: "https://images.unsplash.com/photo-1541888081631-f1eb982ed301?auto=format&fit=crop&w=800&q=80",
          lat: "6.5244",
          lng: "3.3792",
          locationName: "123 Construction Ave, Lagos",
          takenAt: new Date(),
        });
        console.log("Successfully injected a site photo for Land Secured.");
      }
    }

    console.log("Done! You can now click your notifications and view the milestone photos.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
