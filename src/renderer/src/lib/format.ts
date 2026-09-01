/** Show home-relative paths the way the user typed them. */
export const tildify = (p: string): string => p.replace(/^\/home\/[^/]+/, '~').replace(/^\/Users\/[^/]+/, '~')

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))
