import { evenSplit, ownersShareSum, ownersSharesAreValid } from '../../domain/owners';
import { getCategoricalColor, useColorScheme } from '../../utils/palette';
import type { AccountOwner, Person } from '../../domain/types';

/**
 * Checkbox list of people with live share-percentage inputs once 2+ are
 * selected. Used both for Account.owners (who an account belongs to) and
 * Transaction.splitOverride (who a specific expense is split between).
 */
export function OwnerPicker({
  persons,
  owners,
  onChange,
}: {
  persons: Person[];
  owners: AccountOwner[];
  onChange: (owners: AccountOwner[]) => void;
}) {
  const scheme = useColorScheme();
  const selectedIds = owners.map((o) => o.personId);

  function toggle(personId: string) {
    const nextIds = selectedIds.includes(personId)
      ? selectedIds.filter((id) => id !== personId)
      : [...selectedIds, personId];
    onChange(evenSplit(nextIds));
  }

  function setShare(personId: string, sharePercent: number) {
    onChange(owners.map((o) => (o.personId === personId ? { ...o, sharePercent } : o)));
  }

  const sum = ownersShareSum(owners);
  const valid = ownersSharesAreValid(owners);

  return (
    <div className="owner-picker">
      {persons.map((p) => {
        const owner = owners.find((o) => o.personId === p.id);
        return (
          <div key={p.id} className="owner-picker-row">
            <label>
              <input type="checkbox" checked={!!owner} onChange={() => toggle(p.id)} />
              <span className="color-dot" style={{ background: getCategoricalColor(p.colorIndex, scheme === 'dark') }} />
              {p.name}
            </label>
            {owner && owners.length > 1 && (
              <span className="share-input-wrap">
                <input
                  type="number"
                  className="share-input"
                  value={owner.sharePercent.toFixed(1)}
                  min={0}
                  max={100}
                  step={0.1}
                  onChange={(e) => setShare(p.id, Number(e.target.value))}
                />
                %
              </span>
            )}
          </div>
        );
      })}
      {owners.length > 1 && (
        <p className={valid ? 'muted' : 'error'}>
          {sum.toFixed(1)}% assigned{valid ? '' : ' — shares must total 100%'}
        </p>
      )}
    </div>
  );
}
