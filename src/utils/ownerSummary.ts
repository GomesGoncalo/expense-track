import type { AccountOwner, Person } from '../domain/types';

/** "Alice", "Alice (60%), Bob (40%)", or "Unassigned" — for showing who an account belongs to. */
export function ownerSummary(owners: AccountOwner[], personsById: Map<string, Person>): string {
  if (owners.length === 0) return 'Unassigned';
  return owners
    .map((o) => {
      const name = personsById.get(o.personId)?.name ?? 'Unknown';
      return owners.length > 1 ? `${name} (${Math.round(o.sharePercent)}%)` : name;
    })
    .join(', ');
}
