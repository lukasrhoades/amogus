# Impostor Questions Game Rules Spec V1

This document is the source of truth for game-rule implementation.

## 1. Core Round Loop
1. Select a question pair from the game pool.
2. Determine impostor count for the round using weighted selection.
3. Apply eligibility policy (if enabled) and derive active players.
4. Assign roles (impostor/crew) to active players.
5. Prompt active players according to question-pair audience targeting.
6. Collect answers from all active players (mandatory).
7. Reveal true question, then reveal answers with player identity.
8. Run discussion period.
9. Collect mandatory votes from active players.
10. Resolve vote and tiebreak if needed.
11. Reveal role truth and apply scoring.
12. Advance to next round or end game.

## 2. Lobby And Presets
1. System provides a built-in preset named `DEFAULT`.
2. `DEFAULT` starts with exactly one impostor per round.
3. Host can expand settings before each round and modify round configuration.
4. Host can:
- play with modified settings without saving
- save as new preset
- overwrite host-specific default preset

## 3. Player Count
1. Minimum players to run game: `4`.
2. If fewer than 4 players are present, game cannot start or continue to next round.

## 4. Impostor Count Selection
1. Per round, impostor count is selected by weighted random across enabled values.
2. Default weights:
- `0 impostors`: `2.5%`
- `1 impostor`: `95%`
- `2 impostors`: `2.5%`
3. Host can customize weights.

## 5. Question Selection And Reuse
1. Default behavior: question pairs cannot repeat within the same game session.
2. Host can enable `question reuse` to allow repeats in-game.
3. A question used for a canceled/skipped round is still considered consumed when reuse is OFF.

Question pair payload and validity:
1. Each question pair has exactly two prompts: `promptA` and `promptB`.
2. Each prompt has a target audience: `crew`, `impostor`, or `both`.
3. Each pair must include at least one prompt permissible for crew.
4. Each pair must include at least one prompt permissible for impostor.
5. A prompt targeted to `both` counts as permissible for both crew and impostor.
6. Prompt delivery during a round follows each prompt target exactly.

## 6. Eligibility Policy
1. Eligibility policy can be toggled by host before each round starts.
2. Default policy:
- with 4 players: OFF
- with 5 or more players: ON
3. If eligibility policy is ON and selected question belongs to player `P`, then `P` sits out the entire round.
4. A sat-out player does not answer, discuss, vote, or score in that round.

## 7. Answer Submission
1. Answer submission is mandatory for all active players.
2. Phase blocks until all active players submit.
3. Host cannot force-reveal with missing answers.
4. If a player is removed before answer reveal, current round is canceled and next round is prepared.

## 8. Reveal Phase
1. True question is revealed at the start of reveal phase.
2. Answers are shown with player identity immediately.
3. Reveal advancement mode is configurable:
- host step-through (default)
- auto-timed reveal

## 9. Discussion Phase
1. Discussion timer is host-configurable per lobby/preset.
2. If timer exists, host can end early or add time.
3. If no timer, discussion continues until host ends it.
4. Safeguard timeout:
- default max inactivity watchdog is 10 minutes
- if triggered, lobby ends and unfinished game is discarded
5. If host explicitly pauses game, watchdog extends to 1 hour before discard.

## 10. Voting
1. Voting is mandatory for all active players.
2. Self-vote is forbidden.
3. Vote changes before close are host-toggleable; default is ON.
4. Voting phase blocks until all votes are present, unless host uses admin advance for missing votes.
5. In a 2-impostor round, only one player can be eliminated per round.

## 11. Tie Resolution
1. If top votes tie, run a tiebreak event (default implementation: random).
2. Tiebreak loser is treated as voted out.
3. Tiebreak winner is treated as not voted out.
4. This applies for any player count.
5. Future versions may replace random tiebreak with mini-game logic.

## 12. Scoring Defaults
Definitions:
- `crew voted out penalty` is a toggle, default ON.
- penalty value is `-1` when enabled.

1 impostor round:
1. If impostor survives:
- impostor: `+3`
- crew: `0`
- voted-out crew (if any): `-1` when penalty ON, else `0`
2. If impostor voted out:
- each crew: `+1`
- impostor: `0`

0 impostor round:
1. voted-out crew: `-1` when penalty ON, else `0`
2. all others: `0`

2 impostor round:
1. If both impostors survive:
- each impostor: `+3`
- crew: `0`
- voted-out crew (if any): `-1` when penalty ON, else `0`
2. If one impostor voted out:
- surviving impostor: `+3`
- voted-out impostor: `0`
- each crew: `+1`
3. Both impostors voted out in one round is impossible under current rules.

## 13. Round Count
1. Default rounds: `10`.
2. Min rounds: `5`.
3. Max rounds: `30`.
4. If question reuse is OFF, maximum rounds cannot exceed available question pairs in selected pool.

Canceled round effect on round cap:
1. Canceled rounds do not count toward completed round index.
2. If rounds were capped by available questions and reuse is OFF, canceled round that consumed a question reduces remaining playable rounds by 1.
3. If reuse is ON, canceled rounds do not reduce configured total rounds.

## 14. Game End And Winner
1. Game ends when final configured round completes or lobby termination condition is reached.
2. Winner order:
- highest total score
- if tie: most impostor-survival wins
- if still tie: random tiebreak winner

## 15. Disconnect And Removal Rules
Non-host disconnect:
1. Wait for reconnection by default.
2. If host removes disconnected player before answer reveal:
- current round is canceled
- next round starts (subject to player minimum)
3. If host removes disconnected player during voting:
- round may continue
4. Between rounds, host may wait for rejoin or remove from lobby.

Host disconnect:
1. Game pauses immediately.
2. Host has 5 minutes to reconnect.
3. Non-host players can initiate host-transfer vote while host is disconnected.
4. Host-transfer requires unanimous vote of currently connected non-host players.
5. If player count falls below 4 and 5-minute window expires, game ends.

## 16. Admin Actions
Host may:
1. configure settings before each round
2. start/end discussion
3. add discussion time
4. advance voting with missing votes
5. remove players from round/lobby
6. pause game

## 17. Implementation Notes
1. Rules in this document override older planning notes if conflict exists.
2. Any new rule change must update this file before code changes.
