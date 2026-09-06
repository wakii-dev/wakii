// Why: Story-mode input wraps a plain idea into the invocation the desktop
// story-workflow skill expects — 'create story: <idea>' loads the skill there.
export function formatStoryPrompt(idea: string): string {
  const trimmed = idea.trim()
  if (!trimmed) {
    return trimmed
  }
  return `create story: ${trimmed}`
}
