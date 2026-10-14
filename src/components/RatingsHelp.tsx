// Plain-language explainer for the "How do ratings work?" sheet; kept under ~100 words.
// The example numbers come from server/src/elo.ts — recompute them with scoreMatch +
// computeEloUpdate if the scoring rules or constants change.
const EXAMPLES: [string, string][] = [
  ['Equal ratings, win 6-4', '+15'],
  ['Equal ratings, win 6-0', '+20'],
  ['Equal ratings, win a tiebreak 7-5', '+3'],
  ['1400 beats 1200, 6-4', '+7'],
  ['1200 beats 1400, 6-4', '+23'],
]

export function RatingsHelp() {
  return (
    <div className="space-y-4 text-sm text-neutral-700 dark:text-neutral-300">
      <p>
        Everyone starts at <strong>1200</strong>. Whatever the winner gains, the loser
        loses.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Beating a higher-rated player earns more than beating a lower-rated one.</li>
        <li>Lopsided and longer sets count more. A tiebreak counts about a fifth of a set.</li>
        <li>A tie pulls both ratings toward each other.</li>
      </ul>
      <div>
        <h3 className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">
          Examples
        </h3>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {EXAMPLES.map(([label, change]) => (
            <li key={label} className="flex justify-between gap-4 py-2">
              <span>{label}</span>
              <span className="font-medium text-green-600 tabular-nums">{change}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-neutral-500">
        There’s no reason to avoid playing anyone to protect your rating; the points at stake
        are always fair given both players’ ratings.
      </p>
    </div>
  )
}
