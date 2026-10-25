import { useState } from 'react'
import type { ApiMatch } from '../lib/api'
import {
  computeProfile,
  headToHeads,
  roundElo,
  type HeadToHead,
  type Result,
  type Standing,
} from '../lib/records'
import { Delta, StackedMatchRow } from './MatchRow'
import { RatingChart } from './RatingChart'

const RESULT_STYLE: Record<Result, { sign: string; className: string; label: string }> = {
  win: { sign: '+', className: 'bg-green-600 text-white', label: 'Won' },
  draw: { sign: '=', className: 'bg-neutral-400 text-white', label: 'Drew' },
  loss: { sign: '−', className: 'bg-red-500 text-white', label: 'Lost' },
}

export function PlayerProfile({
  standing,
  matches,
  onSelectPlayer,
}: {
  standing: Standing
  matches: ApiMatch[]
  onSelectPlayer: (id: number) => void
}) {
  const { player, wins, draws, losses } = standing
  const profile = computeProfile(player.id, matches)
  const total = profile.history.length
  const rivals = headToHeads(profile.history)
  const [rivalId, setRivalId] = useState<number | null>(null)
  const rival = rivals.find((h) => h.opponentId === rivalId) ?? null
  const history = rival ? rival.history : profile.history

  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-neutral-500">
        {player.name} hasn’t played a match yet.
      </p>
    )
  }

  const pct = (n: number) => `${Math.round((n / total) * 100)}%`

  return (
    <div className="flex flex-col gap-6">
      <section>
        <RatingChart points={profile.ratingPoints} />
      </section>

      <section className="grid grid-cols-4 divide-x divide-neutral-100 rounded-2xl bg-neutral-50 py-3 text-center dark:divide-neutral-800 dark:bg-neutral-800/50">
        <Tile label="Matches" value={total} />
        <Tile label="Wins" value={wins} sub={pct(wins)} dot="bg-green-600" />
        <Tile label="Draws" value={draws} sub={pct(draws)} dot="bg-neutral-400" />
        <Tile label="Losses" value={losses} sub={pct(losses)} dot="bg-red-500" />
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Highlights
        </h3>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          <Highlight
            icon="⬆️"
            label="Highest rating"
            detail={profile.highest.date ?? 'starting rating'}
            value={roundElo(profile.highest.elo)}
          />
          <Highlight
            icon="🏅"
            label="Best win"
            detail={profile.bestWin?.opponentName}
            value={profile.bestWin ? roundElo(profile.bestWin.elo) : '–'}
          />
          <Highlight icon="🔥" label="Best win streak" value={profile.bestWinStreak} />
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Head-to-head
        </h3>
        <div className="flex flex-wrap gap-2">
          {rivals.map((h) => {
            const selected = h.opponentId === rivalId
            return (
              <button
                key={h.opponentId}
                type="button"
                aria-pressed={selected}
                onClick={() => setRivalId(selected ? null : h.opponentId)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-court bg-court text-white'
                    : 'border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-200'
                }`}
              >
                vs {h.opponentName}
              </button>
            )
          })}
        </div>
        {rival ? (
          <RivalSummary name={player.name} rival={rival} />
        ) : (
          <p className="mt-2 text-xs text-neutral-500">
            Pick an opponent to see {player.name}’s record against them.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Match history{rival && ` vs ${rival.opponentName}`}
        </h3>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {history.map((p) => {
            const style = RESULT_STYLE[p.result]
            return (
              <StackedMatchRow
                key={p.match.id}
                match={p.match}
                selfId={player.id}
                top={{
                  id: player.id,
                  name: player.name,
                  rating: p.myBefore,
                  score: p.myScore,
                  delta: p.delta,
                  bold: p.result !== 'loss',
                }}
                bottom={{
                  id: p.opponentId,
                  name: p.opponentName,
                  rating: p.oppBefore,
                  score: p.oppScore,
                  delta: p.oppDelta,
                  bold: p.result !== 'win',
                }}
                onSelectPlayer={onSelectPlayer}
                aside={
                  <>
                    <span
                      aria-label={style.label}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-bold ${style.className}`}
                    >
                      {style.sign}
                    </span>
                    <span className="w-9 shrink-0 text-right text-sm tabular-nums">
                      <Delta value={p.delta} />
                    </span>
                  </>
                }
              />
            )
          })}
        </ul>
      </section>
    </div>
  )
}

// The record against one opponent: both names in bold either side of the wins as one
// big score, each player's win % under their name, then the W / D / L line from this
// player's side. No avatars — with no profile pictures they'd just be green circles that
// read as buttons.
function RivalSummary({ name, rival }: { name: string; rival: HeadToHead }) {
  const { wins, draws, losses, opponentName } = rival
  const played = wins + draws + losses
  const pct = (n: number) => `${Math.round((n / played) * 100)}% won`
  return (
    <div className="mt-3 rounded-2xl bg-neutral-50 px-4 py-4 dark:bg-neutral-800/50">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-neutral-900 dark:text-neutral-100">{name}</div>
          <div className="text-xs text-neutral-500">{pct(wins)}</div>
        </div>
        <div className="text-3xl font-bold whitespace-nowrap tabular-nums text-neutral-900 dark:text-neutral-100">
          {wins}
          <span className="text-neutral-400"> – </span>
          {losses}
        </div>
        <div className="min-w-0 text-right">
          <div className="truncate font-semibold text-neutral-900 dark:text-neutral-100">
            {opponentName}
          </div>
          <div className="text-xs text-neutral-500">{pct(losses)}</div>
        </div>
      </div>
      <div className="mt-3 text-center text-sm font-semibold tabular-nums">
        <span className="text-green-600">{wins}</span>
        <span className="text-neutral-400"> / </span>
        <span className="text-neutral-500">{draws}</span>
        <span className="text-neutral-400"> / </span>
        <span className="text-red-500">{losses}</span>
        <span className="ml-2 font-normal text-neutral-500">
          · {played} {played === 1 ? 'match' : 'matches'}
        </span>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  dot,
}: {
  label: string
  value: number
  sub?: string
  dot?: string
}) {
  return (
    <div className="px-1">
      <div className="flex items-center justify-center gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {dot && <span className={`h-2 w-2 rounded-sm ${dot}`} />}
        {label}
      </div>
      <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{value}</div>
      <div className="h-4 text-xs text-neutral-400">{sub}</div>
    </div>
  )
}

function Highlight({
  icon,
  label,
  detail,
  value,
}: {
  icon: string
  label: string
  detail?: string
  value: number | string
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="w-6 text-center">{icon}</span>
      <span className="font-medium text-neutral-900 dark:text-neutral-100">{label}</span>
      {detail && <span className="truncate text-sm text-neutral-500">{detail}</span>}
      <span className="ml-auto shrink-0 font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {value}
      </span>
    </li>
  )
}
