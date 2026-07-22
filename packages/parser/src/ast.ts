/**
 * AST v0.1 — PROVISIONAL. Grammar assumptions inferred from Oracle's published
 * APEXlang documentation excerpts (26.1). Every assumption must be re-verified
 * against a real APEXlang export (see docs/grammar-assumptions.md) before this
 * contract is frozen. `raw` bags preserve everything we did not understand so
 * partial parsing never lies by omission.
 */

export interface Loc {
  file: string;
  line: number; // 1-based
}

/** Untyped property bag for constructs the typed layer doesn't model yet. */
export type RawValue =
  | string
  | number
  | boolean
  | RefValue
  | RawValue[]
  | { [key: string]: RawValue };

export interface RefValue {
  /** '@employee' -> 'employee'; '@/drawer' -> '/drawer' (standard theme). */
  ref: string;
  standard: boolean;
}

export type RawBag = Record<string, RawValue>;

/** Generic parse tree node: `type identifier ( ...props / children )`. */
export interface ComponentNode {
  type: string;            // 'page' | 'region' | 'item' | ... (open set)
  identifier: string | null;
  props: RawBag;           // flattened: group props keyed as 'appearance.pageMode'
  children: ComponentNode[];
  loc: Loc;
}

export interface ApexAppAst {
  astVersion: '0.1.0-provisional';
  pages: ApexPage[];
  /** Every file consumed, for cache invalidation and provenance. */
  sourceFiles: string[];
  /** Component types encountered that the typed projection skipped. */
  unmodeled: string[];
}

export interface ApexPage {
  id: number;
  alias: string | null;
  name: string | null;
  title: string | null;
  regions: ApexRegion[];
  items: ApexItem[];       // page-level items (not owned by a region)
  buttons: ApexButton[];
  loc: Loc;
  raw: RawBag;
}

export interface ApexRegion {
  identifier: string;
  name: string | null;
  /** Open string; see KNOWN_REGION_TYPES for the recognized subset. */
  type: string | null;
  source: { location: string | null; tableName: string | null; sql: string | null } | null;
  items: ApexItem[];
  buttons: ApexButton[];
  loc: Loc;
  raw: RawBag;
}

export interface ApexItem {
  identifier: string;      // e.g. P3_EMPNO
  type: string | null;     // textField | hidden | selectList | ...
  label: string | null;
  required: boolean;
  sourceColumn: string | null;
  loc: Loc;
  raw: RawBag;
}

export interface ApexButton {
  identifier: string;
  label: string | null;
  action: string | null;
  loc: Loc;
  raw: RawBag;
}

export const KNOWN_REGION_TYPES = [
  'form',
  'interactiveReport',
  'interactiveGrid',
  'classicReport',
  'static',
] as const;
