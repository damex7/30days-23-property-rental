import { Icon } from '@/components/ui/icon'
import { AMENITY_GROUP_LABELS, AMENITY_GROUPS, type AmenityGroup } from '@/lib/options'

/** The amenities a listing has, grouped (Power first: in Nigeria it's the first question). */
export function AmenityList({ codes, all }: { codes: string[]; all: { code: string; label: string; grp: string }[] }) {
  const has = new Set(codes)
  const groups = AMENITY_GROUPS.map((grp) => ({ grp, items: all.filter((a) => a.grp === grp && has.has(a.code)) })).filter((g) => g.items.length > 0)
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {groups.map(({ grp, items }) => (
        <div key={grp}>
          <h3 className="rubric">{AMENITY_GROUP_LABELS[grp as AmenityGroup]}</h3>
          <ul className="mt-2 space-y-1.5">
            {items.map((a) => (
              <li key={a.code} className="flex items-center gap-2">
                <Icon name={grp === 'power' ? 'bolt' : grp === 'safety' ? 'shield' : 'check'} className="size-4 text-primary" />
                {a.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
