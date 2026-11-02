// No `node:module` import here: `orca plugin test` loads this on Node 20.6, which has no registerHooks.

export const isOrcaSpecifier = (specifier: string): boolean =>
  specifier === 'orca' || specifier.startsWith('wakii/')

/** Why a worker cannot import `wakii` at run time; `orca plugin test` says the same. */
export function pluginWorkerOrcaImportMessage(specifier: string): string {
  return `cannot import "${specifier}" at run time: it only provides types. Write \`import type { OrcaWorkerApi } from 'wakii/worker'\` and use the \`wakii\` object passed to activate(wakii).`
}
