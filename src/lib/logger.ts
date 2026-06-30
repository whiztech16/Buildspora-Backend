export function logError(context: string, error: unknown) {
  if (error instanceof Error) {
    console.error(`[${context}] ${error.name} occurred`);
  } else {
    console.error(`[${context}] Unknown error occurred`);
  }
}