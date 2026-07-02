import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { projects, milestones } from "../db/schema";
import { logError } from "../lib/logger";
import { eq } from "drizzle-orm";

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  type: z.enum(["new_build", "renovation"]),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  description: z.string().optional(),
  milestoneBudgets: z.record(z.string(), z.number().nonnegative()),
});

export const createProject = async (req: Request, res: Response): Promise<void> => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }

  const data = parsed.data;
  const dbUserId = (req as any).user.dbUserId;
  const role = (req as any).user.role;

  if (role !== "client") {
    res.status(403).json({ success: false, error: "Only clients can create projects." });
    return;
  }

  const totalBudget = Object.values(data.milestoneBudgets).reduce((sum, v) => sum + v, 0);
  if (totalBudget <= 0) {
    res.status(400).json({ success: false, error: "Total budget must be greater than zero." });
    return;
  }

  try {
    const [project] = await db.insert(projects).values({
      clientId: dbUserId,
      name: data.name,
      type: data.type,
      address: data.address,
      city: data.city,
      state: data.state,
      budget: totalBudget.toFixed(2),
      description: data.description,
      status: "pending",
    }).returning();

    const milestoneRows = Object.entries(data.milestoneBudgets).map(([name, amount], idx) => ({
      projectId: project.id,
      name,
      orderIndex: idx,
      allocatedAmount: amount.toFixed(2),
      status: "pending" as const,
    }));

    const createdMilestones = await db.insert(milestones).values(milestoneRows).returning();

    res.status(201).json({ success: true, project, milestones: createdMilestones });
  } catch (error) {
    logError("createProject", error);
    res.status(500).json({ success: false, error: "Failed to create project. Please try again." });
  }
};

export const getProjects = async (req: Request, res: Response): Promise<void> => {
  const dbUserId = (req as any).user.dbUserId;
  const role = (req as any).user.role;

  try {
    const userProjects = role === "client"
      ? await db.query.projects.findMany({ where: eq(projects.clientId, dbUserId) })
      : await db.query.projects.findMany({ where: eq(projects.contractorId, dbUserId) });

    res.status(200).json({ success: true, projects: userProjects });
  } catch (error) {
    logError("getProjects", error);
    res.status(500).json({ success: false, error: "Failed to fetch projects." });
  }
};

export const getProjectById = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;

  if (!id || typeof id !== "string") {
    res.status(400).json({ success: false, error: "Invalid project id." });
    return;
  }

  try {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found." });
      return;
    }

    const projectMilestones = await db.query.milestones.findMany({
      where: eq(milestones.projectId, id),
      orderBy: (m, { asc }) => [asc(m.orderIndex)],
    });

    res.status(200).json({ success: true, project, milestones: projectMilestones });
  } catch (error) {
    logError("getProjectById", error);
    res.status(500).json({ success: false, error: "Failed to fetch project." });
  }
};