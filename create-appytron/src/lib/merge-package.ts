import { ADDED_ENTRY_NOTES, GATE_DEV_DEPS, GATE_SCRIPTS } from './gate-manifest.js';

type Section = 'scripts' | 'devDependencies';
type Dict = Record<string, string>;
export type Pkg = Record<string, unknown> & { scripts?: Dict; devDependencies?: Dict };

export interface MergeResult {
  pkg: Pkg;
  /** `section.name` entries added to the app. */
  added: string[];
  /** One markdown bullet per entry the app customised; those entries are left as the app has them. */
  todo: string[];
}

function mergeSection(
  section: Section,
  names: readonly string[],
  template: Pkg,
  app: Pkg,
  out: MergeResult,
): void {
  const from = template[section] ?? {};
  const have = app[section] ?? {};
  const next: Dict = { ...have };
  for (const name of names) {
    const wanted = from[name];
    if (wanted === undefined) {
      throw new Error(`gate-manifest lists ${section}.${name} but the template's package.json has none`);
    }
    const current = have[name];
    if (current === undefined) {
      next[name] = wanted;
      out.added.push(`${section}.${name}`);
      const note = ADDED_ENTRY_NOTES[`${section}.${name}`];
      if (note !== undefined) out.todo.push(`- package.json ${section}.${name}: ${note}`);
    } else if (current !== wanted) {
      out.todo.push(
        `- package.json ${section}.${name}: yours "${current}", framework "${wanted}". Not changed; update it if you want it to run as shipped.`,
      );
    }
  }
  if (out.added.some((a) => a.startsWith(`${section}.`))) {
    // scripts keep the app's order (new ones appended); devDependencies stay sorted like npm writes them.
    const entries = Object.entries(next);
    out.pkg[section] = Object.fromEntries(
      section === 'devDependencies' ? entries.sort(([a], [b]) => a.localeCompare(b)) : entries,
    );
  }
}

/** Add the gate scripts and devDependencies the app lacks; never replace a value the app already has. */
export function mergeGatePackage(template: Pkg, app: Pkg): MergeResult {
  const out: MergeResult = { pkg: { ...app }, added: [], todo: [] };
  mergeSection('scripts', GATE_SCRIPTS, template, app, out);
  mergeSection('devDependencies', GATE_DEV_DEPS, template, app, out);
  return out;
}
