import type { ApiMatch, ApiPlayer } from './api'

export interface Standing {
  player: ApiPlayer
  wins: number
  draws: number
  losses: number
  winPct: number
  streak: { kind: 'win' | 'loss'; count: number } | null
  // ELO change from the player's most recent match, null if they haven't played
  lastDelta: number | null
}

const STARTING_ELO = 1200

// Ratings are stored exact (fractional); round only when displaying one. The `+ 0`
// turns -0 into 0, so a change of -0.3 shows as "+0" rather than "−0".
export function roundElo(elo: number) {
  return Math.round(elo) + 0
}

// The order ratings are applied in — the date played, then the order logged for
// same-day matches. Must match server/src/ratings.ts.
function ratingOrder(x: ApiMatch, y: ApiMatch) {
  return x.played_on.localeCompare(y.played_on) || x.id - y.id
}

function eloAfter(match: ApiMatch, playerId: number) {
  return match.player_a_id === playerId
    ? match.player_a_elo_after
    : match.player_b_elo_after
}

export function computeStandings(
  players: ApiPlayer[],
  matches: ApiMatch[],
): Standing[] {
  const newestFirst = [...matches].sort(
    (a, b) => b.played_on.localeCompare(a.played_on) || b.id - a.id,
  )

  return players
    .map((player) => {
      const mine = newestFirst.filter(
        (m) => m.player_a_id === player.id || m.player_b_id === player.id,
      )
      const results = mine.map((m) =>
        m.winner_id === null
          ? ('draw' as const)
          : m.winner_id === player.id
            ? ('win' as const)
            : ('loss' as const),
      )

      const wins = results.filter((r) => r === 'win').length
      const draws = results.filter((r) => r === 'draw').length
      const losses = results.length - wins - draws
      const winPct = results.length === 0 ? 0 : Math.round((wins / results.length) * 100)

      // A draw breaks a streak (and can't start one).
      let streak: Standing['streak'] = null
      if (results.length > 0 && results[0] !== 'draw') {
        const kind = results[0]
        let count = 0
        while (count < results.length && results[count] === kind) count++
        streak = { kind, count }
      }

      const lastDelta =
        mine.length === 0
          ? null
          : eloAfter(mine[0], player.id) -
            (mine[1] ? eloAfter(mine[1], player.id) : STARTING_ELO)

      return { player, wins, draws, losses, winPct, streak, lastDelta }
    })
    .sort((a, b) => b.player.elo - a.player.elo)
}

export type Result = 'win' | 'draw' | 'loss'

export interface ProfileMatch {
  match: ApiMatch
  result: Result
  myScore: number
  oppScore: number
  opponentId: number
  opponentName: string
  // Both players' ratings going into the match, and this player's change from it
  myBefore: number
  oppBefore: number
  delta: number
  oppDelta: number
}

export interface Profile {
  // Newest first, for the history list
  history: ProfileMatch[]
  // This player's rating after each match, in the order ratings were applied (played
  // order), starting from the 1200 baseline
  ratingPoints: { elo: number; date: string | null; opponentName: string | null }[]
  highest: { elo: number; date: string | null }
  bestWin: { opponentName: string; elo: number } | null
  bestWinStreak: number
}

// Ratings are applied in played order (see ratingOrder), so pre-match ratings are
// recovered by walking every match in that order from the baseline.
export function ratingsBefore(matches: ApiMatch[]) {
  const current = new Map<number, number>()
  const before = new Map<number, { a: number; b: number }>()
  for (const m of [...matches].sort(ratingOrder)) {
    before.set(m.id, {
      a: current.get(m.player_a_id) ?? STARTING_ELO,
      b: current.get(m.player_b_id) ?? STARTING_ELO,
    })
    current.set(m.player_a_id, m.player_a_elo_after)
    current.set(m.player_b_id, m.player_b_elo_after)
  }
  return before
}

export function computeProfile(playerId: number, matches: ApiMatch[]): Profile {
  const before = ratingsBefore(matches)

  const mine: ProfileMatch[] = matches
    .filter((m) => m.player_a_id === playerId || m.player_b_id === playerId)
    .map((m) => {
      const isA = m.player_a_id === playerId
      const b = before.get(m.id)!
      const myBefore = isA ? b.a : b.b
      return {
        match: m,
        result:
          m.winner_id === null ? 'draw' : m.winner_id === playerId ? 'win' : 'loss',
        myScore: isA ? m.score_a : m.score_b,
        oppScore: isA ? m.score_b : m.score_a,
        opponentId: isA ? m.player_b_id : m.player_a_id,
        opponentName: isA ? m.player_b_name : m.player_a_name,
        myBefore,
        oppBefore: isA ? b.b : b.a,
        delta: eloAfter(m, playerId) - myBefore,
        oppDelta: (isA ? m.player_b_elo_after : m.player_a_elo_after) - (isA ? b.b : b.a),
      }
    })

  // Streaks and the rating line both follow play order; a draw breaks a streak.
  const oldestFirst = [...mine].sort((x, y) => ratingOrder(x.match, y.match))
  const ratingPoints: Profile['ratingPoints'] = [
    { elo: STARTING_ELO, date: null, opponentName: null },
    ...oldestFirst.map((p) => ({
      elo: eloAfter(p.match, playerId),
      date: p.match.played_on.slice(0, 10),
      opponentName: p.opponentName,
    })),
  ]
  const highest = ratingPoints.reduce((best, p) => (p.elo > best.elo ? p : best))

  const bestWin = mine
    .filter((p) => p.result === 'win')
    .reduce<ProfileMatch | null>((best, p) => (!best || p.oppBefore > best.oppBefore ? p : best), null)

  let bestWinStreak = 0
  let run = 0
  for (const p of oldestFirst) {
    run = p.result === 'win' ? run + 1 : 0
    bestWinStreak = Math.max(bestWinStreak, run)
  }

  return {
    history: oldestFirst.reverse(),
    ratingPoints,
    highest: { elo: highest.elo, date: highest.date },
    bestWin: bestWin && { opponentName: bestWin.opponentName, elo: bestWin.oppBefore },
    bestWinStreak,
  }
}

export interface HeadToHead {
  opponentId: number
  opponentName: string
  // Newest first, like Profile.history
  history: ProfileMatch[]
  wins: number
  draws: number
  losses: number
}

// Every opponent this player has faced, most-played first, with their record against each.
export function headToHeads(history: ProfileMatch[]): HeadToHead[] {
  const byOpponent = new Map<number, HeadToHead>()
  for (const p of history) {
    let h = byOpponent.get(p.opponentId)
    if (!h) {
      h = {
        opponentId: p.opponentId,
        opponentName: p.opponentName,
        history: [],
        wins: 0,
        draws: 0,
        losses: 0,
      }
      byOpponent.set(p.opponentId, h)
    }
    h.history.push(p)
    if (p.result === 'win') h.wins++
    else if (p.result === 'draw') h.draws++
    else h.losses++
  }
  return [...byOpponent.values()].sort(
    (x, y) => y.history.length - x.history.length || x.opponentName.localeCompare(y.opponentName),
  )
}
