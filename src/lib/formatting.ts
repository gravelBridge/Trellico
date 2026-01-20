/**
 * Convert kebab-case to Title Case
 * e.g., "my-plan-name" -> "My Plan Name"
 */
export function kebabToTitle(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Strip known prompt prefixes from user messages (e.g., PRD prompt)
 */
export function stripPromptPrefix(content: string): string {
  // Look for the ending marker of the PRD prompt
  const prdMarker = "Below is the user prompt with the feature description:";
  const prdIndex = content.indexOf(prdMarker);
  if (prdIndex !== -1) {
    return content.slice(prdIndex + prdMarker.length).trim();
  }
  return content;
}
