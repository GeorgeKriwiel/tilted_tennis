// 50 = the user's choice (2026-10-14) so a close 6-4 set between equals is worth
// ±25. Was 30; raised ×1.67 to make results (especially tiebreaks) feel like they
// count and let ratings settle ~2× faster given how few sets get logged, at the cost
// of more bounce (simulated: settled error ±72 vs ±54; biggest single-set swing ~63).
// Every multiplier below is relative to this, so changing it scales everything.
const BASE_K = 50

// Sets: a "standard" 6-game set needs no K adjustment; going short or long of it
// nudges K up or down by 10% per game.
const STANDARD_GAMES = 6
const K_CHANGE_PER_GAME = 0.1

// Tiebreaks count as a fixed fraction of a standard set, by the winner's points:
// (points + 5) / 60, so a 7-point breaker is 1/5 of a set and a 10-point one 1/4,
// rising ~1/60 per extra point, capped at 1/3 for a marathon breaker. The user chose
// this ratio: a 7-5 breaker is ~12 points vs ~60 in a set, and point-level modelling
// of tennis scoring agrees (a 7-pt breaker carries ~0.20 of a set's information,
// a 10-pt one ~0.27). Replaced (2026-10-14) a ÷4 game-equivalent rule that made a
// 7-5 breaker worth ~0.57 of a set, so long sessions of breakers outweighed sets.
const TIEBREAK_POINTS_OFFSET = 5
const TIEBREAK_POINTS_PER_SET = 60
const MAX_TIEBREAK_FRACTION = 1 / 3

// Set length is capped on the high end only (+30%), so a freak long or mistyped
// score can't inflate K unboundedly (sets are also hard-capped at 8 games in
// matchInput.ts). Deliberately no floor: K keeps shrinking game by game for a
// shorter set (a 1-1 draw weighs less than a 4-4 one) rather than flattening at
// some arbitrary minimum. Self-limiting anyway — the higher score is always at
// least 1, so it bottoms out at x0.5. The margin multiplier shares this cap.
const MAX_MULTIPLIER = 1.3

// Margin of victory scales K too (the FiveThirtyEight NFL/NBA Elo approach), but
// never the result itself: a win is still 1, a loss 0, a draw 0.5, so winning
// always gains rating and losing always costs it — margin only changes by how
// much. A 2-game/2-point margin is standard (×1, the normal win-by-2) for both
// types. Each game beyond it adds 10% for a set; each point adds 5% for a
// tiebreak (points are smaller units; a game-equivalent conversion would make a
// 7-0 breaker count as a *close* result). Capped at the same ×1.3; a 1-margin
// squeaker (7-6) gets a little less than standard. Draws have no margin (×1).
const STANDARD_MARGIN = 2
const SET_K_CHANGE_PER_MARGIN_GAME = 0.1
const TIEBREAK_K_CHANGE_PER_MARGIN_POINT = 0.05

// Favourites win by bigger margins, so on its own the margin multiplier hands them
// free rating over time (stretching the ladder ~5% beyond true skill in simulation).
// To keep every pairing break-even on average — so nobody gains by seeking out or
// avoiding weaker/stronger opponents — K is scaled by c / (gap × 0.001 + c), where
// gap is the winner's pre-match rating minus the loser's: slightly less when the
// favourite wins, slightly more for an upset (about ∓2% at a 200-point gap). The
// form is FiveThirtyEight's margin-autocorrelation fix; their NFL constant (2.2)
// over-corrected badly here (ratings ~10% *compressed*, short-changing favourites),
// so c was tuned by simulating sets (6-game, win by 2, 7-6 tiebreak) between players
// of known skill until the rating spread matched plain Elo. Draws: no correction.
const FAVOURITE_CORRECTION = 8.8

export type MatchType = 'set' | 'tiebreak'

// scoreA is player A's actual score: 1 = A won, 0.5 = draw, 0 = A lost. The
// expected scores are standard Elo (400-point scale), so a draw still moves
// ratings toward each other when they differ. Not rounded: ratings are stored
// exact, so small changes accumulate instead of being rounded away each match.
export function computeEloUpdate(
  ratingA: number,
  ratingB: number,
  scoreA: 0 | 0.5 | 1,
  k = BASE_K,
) {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
  const expectedB = 1 - expectedA

  return {
    newRatingA: ratingA + k * (scoreA - expectedA),
    newRatingB: ratingB + k * (1 - scoreA - expectedB),
  }
}

// A match is a single set or a single tiebreak. Whoever scored more wins;
// equal scores is a draw — only possible for a set; a tiebreak can never tie
// (enforced in matchInput.ts). A set's K is scaled by the higher score (the
// winner's, or the tied score on a draw) relative to the 6-game standard — so an
// 8-8 draw weighs more than a 1-1 one, just as a 7-5 win weighs more than a 3-1
// one; a tiebreak's K is its fixed fraction of a set (see TIEBREAK_POINTS_PER_SET). A win's margin then
// scales K again (see STANDARD_MARGIN), so a 6-0 moves ratings more than a 6-4,
// and a 6-4 more than a 7-6 would at the same length. The two multipliers combine,
// e.g. 6-0 = ×1.0 length × ×1.3 margin = K 65 between equal ratings. Finally, the
// favourite correction (FAVOURITE_CORRECTION) needs the pre-match ratings.
export function matchResult(gamesA: number, gamesB: number): 0 | 0.5 | 1 {
  return gamesA === gamesB ? 0.5 : gamesA > gamesB ? 1 : 0
}

export function scoreMatch(
  gamesA: number,
  gamesB: number,
  type: MatchType,
  ratingA: number,
  ratingB: number,
): { scoreA: 0 | 0.5 | 1; k: number } {
  const top = Math.max(gamesA, gamesB)
  const lengthMultiplier =
    type === 'tiebreak'
      ? Math.min(
          MAX_TIEBREAK_FRACTION,
          (top + TIEBREAK_POINTS_OFFSET) / TIEBREAK_POINTS_PER_SET,
        )
      : Math.min(MAX_MULTIPLIER, 1 + K_CHANGE_PER_GAME * (top - STANDARD_GAMES))

  const margin = Math.abs(gamesA - gamesB)
  const perMargin =
    type === 'tiebreak' ? TIEBREAK_K_CHANGE_PER_MARGIN_POINT : SET_K_CHANGE_PER_MARGIN_GAME
  const marginMultiplier =
    margin === 0 ? 1 : Math.min(MAX_MULTIPLIER, 1 + perMargin * (margin - STANDARD_MARGIN))

  const scoreA = matchResult(gamesA, gamesB)
  const winnerGap = scoreA === 1 ? ratingA - ratingB : ratingB - ratingA
  const favouriteCorrection =
    scoreA === 0.5 ? 1 : FAVOURITE_CORRECTION / (winnerGap * 0.001 + FAVOURITE_CORRECTION)

  return { scoreA, k: BASE_K * lengthMultiplier * marginMultiplier * favouriteCorrection }
}
