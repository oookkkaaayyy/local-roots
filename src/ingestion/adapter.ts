import type { RawEventRecord } from "./types.js";

export interface SourceAdapter<TRaw = unknown> {
  readonly key: string;
  parse(input: TRaw): RawEventRecord[];
}

/**
 * Fixture-only adapter used for Milestone 2. It deliberately accepts named-key
 * objects only so positional spreadsheet-column mapping cannot re-enter the
 * ingestion boundary.
 */
export class NamedFixtureAdapter implements SourceAdapter<unknown> {
  readonly key = "fixture";

  parse(input: unknown): RawEventRecord[] {
    if (!Array.isArray(input)) {
      throw new TypeError("fixture payload must be an array of named-field objects");
    }

    return input.map((row, index) => {
      if (Array.isArray(row) || row === null || typeof row !== "object") {
        throw new TypeError(`fixture row ${index} must be a named-field object, not a positional array`);
      }
      return { ...(row as RawEventRecord) };
    });
  }
}
