import { describe, expect, it } from 'vitest';
import { CHANGELOG, unseenEntries, type ChangelogEntry } from '../src/changelog';

const entry = (version: string): ChangelogEntry => ({ version, date: version, title: version, items: [] });
const list = ['2026-10-09', '2026-10-08b', '2026-10-08', '2026-10-07', '2026-10-06'].map(entry);
const versions = (e: ChangelogEntry[]) => e.map((x) => x.version);

describe('changelog', () => {
  it('lists newest first with unique, increasing versions', () => {
    const v = versions(CHANGELOG);
    expect(new Set(v).size).toBe(v.length);
    expect([...v].sort().reverse()).toEqual(v);
  });

  it('shows only releases after the last one a player saw', () => {
    expect(versions(unseenEntries('2026-10-08', '2026-01-01T00:00:00Z', list))).toEqual(['2026-10-09', '2026-10-08b']);
    expect(unseenEntries('2026-10-09', '2026-01-01T00:00:00Z', list)).toEqual([]);
  });

  it('caps a long backlog to the three newest', () => {
    expect(versions(unseenEntries(null, '2026-01-01T00:00:00Z', list))).toEqual(['2026-10-09', '2026-10-08b', '2026-10-08']);
  });

  it('skips releases from before the account existed', () => {
    expect(versions(unseenEntries(null, '2026-10-08T12:00:00Z', list))).toEqual(['2026-10-09', '2026-10-08b', '2026-10-08']);
    expect(versions(unseenEntries(null, '2026-10-09T08:00:00Z', list))).toEqual(['2026-10-09']);
    expect(unseenEntries(null, '2026-10-10T08:00:00Z', list)).toEqual([]);
  });
});
