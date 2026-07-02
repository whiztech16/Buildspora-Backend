export const MILESTONE_WEIGHTS_NEW_BUILD: { name: string; weight: number }[] = [
  { name: "Land Secured", weight: 0.25 },
  { name: "Site Preparation", weight: 0.05 },
  { name: "Foundation", weight: 0.15 },
  { name: "Block Work", weight: 0.15 },
  { name: "Roofing", weight: 0.10 },
  { name: "Electrical", weight: 0.10 },
  { name: "Finishing", weight: 0.15 },
  { name: "Completed", weight: 0.05 },
];
// Sums to 1.0

export const MILESTONE_WEIGHTS_RENOVATION: { name: string; weight: number }[] = [
  { name: "Assessment", weight: 0.05 },
  { name: "Demolition", weight: 0.10 },
  { name: "Structural Work", weight: 0.20 },
  { name: "Plumbing/Electrical", weight: 0.15 },
  { name: "Plastering/Tiling", weight: 0.15 },
  { name: "Painting", weight: 0.10 },
  { name: "Finishing", weight: 0.15 },
  { name: "Completed", weight: 0.10 },
];
// Sums to 1.0

export function getMilestoneWeights(type: "new_build" | "renovation") {
  return type === "renovation" ? MILESTONE_WEIGHTS_RENOVATION : MILESTONE_WEIGHTS_NEW_BUILD;
}