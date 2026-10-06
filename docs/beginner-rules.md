# Guandan: Beginner Rules and Product Specification

This document records the rules currently specified for the game and the intended teaching experience. Items that are not precise enough to implement are listed in [NEEDS DECISION](#needs-decision). Do not infer an answer to those items.

## 1. Game Overview

Guandan is a four-player partnership card game: two teams of two players sit opposite one another. The game uses two standard 54-card decks, for 108 physical cards total. Each player is dealt 27 cards.

A match consists of multiple rounds. Each round has one active Current Level Rank, which affects card strength and identifies the Heart wildcard. Team A and Team B each maintain their own progression level, which may differ. The active Current Level Rank for a round is taken from the applicable level of the team containing the previous round's first-place finisher, after that team's advancement result has been processed. Reaching Ace (A) does not by itself win the match; see [A-Level and Match Victory](#a-level-and-match-victory).

## 2. Physical Cards and Teams

- There are two physical copies of each ordinary suited card.
- There are two Small Jokers and two Big Jokers.
- Every physical card must eventually have a unique game-engine ID.
- Opposite seats are teammates.

## 3. Current Level Rank and Card Strength

Every round has one Current Level Rank. It changes as teams progress; it is not a fixed rank. For rank-based strength comparisons, place the Current Level Rank above 2 and skip it from its usual position in the normal rank order. If 2 itself is the Current Level Rank, it appears only once in the order.

General card-strength order, from strongest to weakest:

**Big Joker > Small Joker > Current Level Rank > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3**

For example, when 10 is the Current Level Rank:

**Big Joker > Small Joker > 10 > 2 > A > K > Q > J > 9 > 8 > 7 > 6 > 5 > 4 > 3**

When 2 is the Current Level Rank:

**Big Joker > Small Joker > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3**

Use this order for rank-based comparisons, such as Singles, Pairs, Triples, Full Houses, and equal-size Rank Bombs. It is not the sequence order for Straights, Consecutive Pairs, Triple Sequences, or Straight Flushes. Those combinations use separate sequence logic. The Level Rank promotion affects card strength but never changes sequence adjacency. For example, if 7 is the Level Rank, 7 is strong in rank-based comparisons, but `5-6-7-8-9` remains an ordinary sequence containing 7. Do not use one universal rank number for all comparisons.

## 4. Heart Level Wildcard (逢人配)

The Heart card whose rank matches the Current Level Rank is a wildcard. For example, Heart 10 is wild when 10 is the Current Level Rank. Because two decks are used, there are exactly two physical copies of that Heart Level card.

The Heart Level card may always be played as its naturally printed Current Level Rank without using its wildcard ability. This is not a substitution. When its wildcard ability is used, it may represent an ordinary non-Joker card as needed to form a legal combination. It may never represent a Big Joker or Small Joker, and cannot create or complete a Four-Joker Bomb.

Wildcard substitution may be used in Pairs, Triples, Full Houses, Straights, Consecutive Pairs, Triple Sequences (Gangban), Rank Bombs, and Straight Flushes when the interpreted cards form a legal combination. A Heart Level card may also be played as its natural rank in any combination that allows that rank, including a Single. A wildcard does not change a combination's required physical card count: Straights have five physical cards; Consecutive Pairs and Gangban have six physical cards each. It substitutes for a missing card; it does not create an extra card.

Both physical Heart Level wildcards may be used in one play and assigned independently; they need not represent the same rank. Each physical wildcard can represent only one card position. All interpreted combinations must use the actual selected physical cards, and each selected card can be counted only once.

Example: with 10 as the Current Level Rank, Heart 10 may represent 5 in `2-3-4-5-6`. The interface must show every wildcard's represented rank and, when relevant, effective suit, as well as the final combination. It must never hide or silently change an interpretation.

### Multiple Wildcard Interpretations

The same selected physical cards may have multiple valid wildcard interpretations, including different combination types or different represented ranks within one combination type. The future rules engine should be able to return all valid interpretations rather than silently choosing one. An interpretation should describe its resulting combination type, represented ranks, each wildcard's use, comparison strength, and whether it legally beats the current play.

Beginner Mode and Expert Mode use the same deck, combination, wildcard legality, comparison, Bomb, and level rules. They differ only in interface assistance:

- **Beginner Mode:** If multiple interpretations are valid, the assistance layer recommends one and clearly explains it. For example: “Use Heart 6 as 8 to form 6-7-8-9-10.” The player can see what each wildcard represents and the final combination; the meaning is never changed invisibly.
- **Expert Mode:** Present the legal interpretations as alternatives, without automatically recommending one as the default strategy. The player chooses the intended interpretation before confirming the play.

The core rules engine determines which interpretations are legal. The assistance layer recommends an interpretation for Beginner Mode; it does not change the rules or legal result. The confirmed play explicitly identifies the interpretation to validate.

## 5. Combination Types and Comparison Overview

The game supports these play types:

1. Single
2. Pair
3. Triple
4. Full House (Triple + Pair)
5. Straight
6. Consecutive Pairs (三连对)
7. Triple Sequence (Gangban / 钢板)
8. Rank Bomb
9. Straight Flush Bomb (同花顺)
10. Four-Joker Bomb (四王)

Normal non-bomb combinations may beat only the same combination type. For example, a Pair does not beat a Single, and a Straight does not beat a Triple. Bombs are exceptions and can beat normal non-bomb combinations according to the bomb rules below. Passing is allowed when responding; a player is not required to play just because they can.

## 6. Normal Combinations

### Single

A Single is exactly one card. Compare it using the general card-strength order. A Single normally responds only to a Single; a Bomb can also beat it.

### Pair

A Pair is exactly two cards representing the same rank after wildcard interpretation. For example, `8 8`. Compare Pairs by represented rank using the general card-strength order. A Pair normally responds only to a Pair; a Bomb can also beat it.

### Triple

A Triple is exactly three cards representing the same rank after wildcard interpretation. Compare Triples by represented rank using the general card-strength order. A Triple normally responds only to a Triple; a Bomb can also beat it.

### Full House (Triple + Pair)

A Full House consists of one Triple plus one Pair, for example `333 + 44`. Compare two Full Houses by the rank of the Triple portion; the Pair portion does not determine the main strength. A Full House normally responds only to a Full House; a Bomb can also beat it.

### Straight

A Straight is exactly five cards, one for each of five consecutive ranks. It is not restricted to one suit. Four-card, six-card, and other-length Straights are not valid. The valid progression from lowest to highest is:

`A-2-3-4-5` → `2-3-4-5-6` → `3-4-5-6-7` → `4-5-6-7-8` → `5-6-7-8-9` → `6-7-8-9-10` → `7-8-9-10-J` → `8-9-10-J-Q` → `9-10-J-Q-K` → `10-J-Q-K-A`

`A-2-3-4-5` is the lowest and `10-J-Q-K-A` is the highest. Ace can be low before 2 or high after K, but sequences cannot wrap around. For example, `J-Q-K-A-2`, `Q-K-A-2-3`, and `K-A-2-3-4` are invalid. Current Level Rank does not change this sequence order. A Straight normally responds only to a higher Straight; a Bomb can also beat it.

### Consecutive Pairs (三连对)

Consecutive Pairs consists of exactly three consecutive Pairs: six cards total. Each group below represents one Pair. Its sequence progression from lowest to highest is `AA 22 33`, `22 33 44`, `33 44 55`, `44 55 66`, `55 66 77`, `66 77 88`, `77 88 99`, `88 99 1010`, `99 1010 JJ`, `1010 JJ QQ`, `JJ QQ KK`, and `QQ KK AA`. Thus `AA 22 33` is lowest and `QQ KK AA` is highest. Sequences do not wrap around; for example, `KK AA 22` is invalid. Current Level Rank does not alter adjacency. Plays containing any other number of consecutive Pairs are invalid. A Consecutive Pairs play normally responds only to a higher Consecutive Pairs play; a Bomb can also beat it.

### Triple Sequence (Gangban / 钢板)

A Triple Sequence (Gangban) consists of exactly two consecutive Triples: six cards total. Its valid sequence progression from lowest to highest is `AAA-222`, `222-333`, `333-444`, `444-555`, `555-666`, `666-777`, `777-888`, `888-999`, `999-101010`, `101010-JJJ`, `JJJ-QQQ`, `QQQ-KKK`, and `KKK-AAA`. Here `101010` represents three 10s. `AAA-222` is the lowest and `KKK-AAA` is the highest. Equivalent visual ordering such as `222-AAA` represents the same rank combination as `AAA-222`; physical card order within the selected play does not matter. The Current Level Rank does not change Gangban adjacency or sequence strength. Compare valid Gangban plays by their sequence position: for example, `555-666` beats `444-555`, and `KKK-AAA` beats `QQQ-KKK`. One Triple, three consecutive Triples, or four consecutive Triples do not form this play type. Do not confuse Gangban with Consecutive Pairs. A Triple Sequence normally responds only to a higher Triple Sequence; a Bomb can also beat it.

## 7. Bombs

Bombs beat normal non-bomb combinations. When responding to a Bomb, use the bomb hierarchy and comparison rules in this section.

### Rank Bomb

A Rank Bomb contains at least four physical cards representing the same rank after wildcard interpretation. Its length is variable. Physical-card accounting happens before wildcard interpretation; never count a physical card more than once. Do not impose a global eight-card maximum.

For a target rank that is not the Current Level Rank, two decks can provide up to eight natural physical cards of that rank. If the player also holds both physical Heart Level wildcards, each may represent that target rank, for a theoretical maximum of ten physical cards in that non-Level Rank Bomb. For example, with 6 as the Current Level Rank, eight natural 9s plus both Heart 6 wildcards interpreted as 9s can form a ten-card Rank Bomb.

If the target rank is the Current Level Rank, the Heart Level cards are already physical cards of that rank. Do not count them again as extra wildcards; at most eight physical cards of that rank exist across the two decks, including both Heart Level cards. In every case, the maximum Bomb size is derived from the actual physical cards selected and legal wildcard interpretation.

Any Rank Bomb beats any normal non-bomb combination. When comparing two Rank Bombs, compare card count first: the Bomb with more cards wins regardless of rank. Only equal-size Rank Bombs compare rank, using the general card-strength order. For example, a five-card Rank Bomb beats a four-card Rank Bomb even if the four-card Bomb's rank is stronger. If both are four cards, a King Rank Bomb beats a Queen Rank Bomb unless the Current Level Rank changes their relative strength.

### Straight Flush Bomb (同花顺)

A Straight Flush is a Bomb consisting of exactly five consecutive cards of the same suit. Example: `6♠ 7♠ 8♠ 9♠ 10♠`. It is not an ordinary Straight.

A Straight Flush must contain exactly five physical cards, form one of the valid five-rank Straight sequences, and have the same effective suit for all interpreted cards. A Heart Level wildcard may change both its represented rank and effective suit to fill a missing ordinary non-Joker card. Two physical Heart Level wildcards may both participate and be assigned independently, subject to the physical-card and sequence requirements. The card count remains exactly five.

For example, with 6 as the Current Level Rank, `7♠ 8♠ 9♠ 10♠ Heart 6` may be interpreted as `7♠-8♠-9♠-10♠-J♠`, a valid Straight Flush. With `7♠ 8♠ 9♠` and both physical Heart 6 wildcards, the wildcards may represent `10♠` and `J♠` to form `7♠-8♠-9♠-10♠-J♠`. Whenever a wildcard changes effective suit, the UI must make that explicit, for example: “Heart 6 is acting as J♠.”

A Straight Flush beats every normal non-bomb play and every four- or five-card Rank Bomb. It loses to any valid Rank Bomb of six or more cards and to the Four-Joker Bomb. Two Straight Flushes compare by the strength of their five-card sequences; suit does not break a tie. Use sequence-order principles, not a poker-style suit ranking.

### Four-Joker Bomb (四王)

The Four-Joker Bomb consists of all four actual Joker cards in the game: two physical Big Jokers and two physical Small Jokers. Wildcards cannot represent or replace any of them. A two-card Joker pair is not a Four-Joker Bomb. This is the strongest play; nothing beats it, regardless of Rank Bomb size.

### Bomb Hierarchy

From weaker to stronger:

**Normal non-bomb combinations < 4-card Rank Bomb < 5-card Rank Bomb < Straight Flush < any Rank Bomb of 6 or more cards < Four-Joker Bomb**

Rank Bombs with more cards beat those with fewer cards, regardless of represented rank. Only equal-size Rank Bombs compare represented rank. For example, a 9-card Rank Bomb beats an 8-card Rank Bomb, and a 10-card Rank Bomb beats a 9-card Rank Bomb, regardless of rank. Any Rank Bomb with 6 or more cards beats a Straight Flush. The Four-Joker Bomb remains the strongest play and beats every Rank Bomb, regardless of its size.

## 8. Passing and Trick Flow

During an ongoing round, players take turns responding to the current highest play. A player may play a legal combination that beats it, play a legal Bomb that beats it, or Pass. A player may Pass even when a legal response is available. The current highest valid play remains in control until another player beats it. Compare plays according to the Guandan comparison rules: unrelated normal combination types do not beat one another merely because their card ranks are higher; Bombs follow the Bomb rules and can beat normal combinations.

Once a player successfully plays all cards from their hand, they are finished: they retain their finishing position, have no cards, are removed from active turn rotation, do not Pass, do not respond to future plays or tricks, and cannot lead a future trick themselves. Their final play does not automatically end the current trick; other active players may still respond to it.

When all other active players have Passed and nobody beats the current highest play, the trick ends. The player who made the current highest play wins the trick. If the round is already complete after finishing positions are determined, proceed to round-end processing without starting another trick. Otherwise, if that play was the winning final play of a player who has finished, that player's teammate leads the next trick. In all other cases, the player who made the current highest play leads. The new trick begins with no previous combination to beat, so its leader may open with any legal combination.

Example: Player A plays Pair 7, Player B plays Pair 9, Player C passes, Player D plays Pair J, then Players A, B, and C pass. Player D's Pair J is the current highest play, so Player D wins the trick and leads the next trick with any legal combination.

Bombs follow the same trick-winning principle. For example, if Player A plays Pair Q, Player B plays Pair K, and Player C plays the four-card Bomb `7777`, then Player D, Player A, and Player B pass, Player C's Bomb is the current highest play. Player C wins the trick and leads the next one.

### A Finishing Player's Final Play

A player earns their finishing position when they successfully play all remaining cards from their hand. This teammate-inherits-lead rule applies to any finishing player, not only the first-place finisher (头游). Other active players may still respond to the final play.

If nobody beats a finishing player's final play, it remains the current highest play and wins the trick. If another trick must be played, the finisher's teammate leads it and may play any legal combination.

Example: Players A and C are teammates. Player A plays their final cards, then Players B, C, and D pass. Nobody beats Player A's play, so Player A finishes first and Player C leads the next trick with any legal combination, if play must continue.

Example: Player A has already finished. Players B and D are teammates. Player B plays their final cards, then Players C and D pass. If B's final play remains the winning play and another trick must be played, Player D leads the next trick with any legal combination.

If another active player beats a finishing player's final play, the trick continues normally. The finisher remains finished and takes no further turns. If nobody later beats the play that overtook the final play, that play wins the trick: its player leads the next trick if they still have cards, otherwise their teammate leads. The original finisher's teammate does not inherit the lead because the original final play was beaten.

Example: Players A and C are teammates. Player A plays their final cards and finishes first. Player B beats that play; Player C and the other active players pass. If nobody later beats Player B, Player B wins the trick and leads the next one if they still have cards. Player A's teammate does not inherit the lead. If Player B also finished on that play, Player B's teammate leads instead.

These are in-round trick-flow rules, separate from the specified next-round lead after Tribute or Anti-Tribute. A round-end condition takes precedence over starting another trick; teammate inheritance matters only if gameplay must continue.

## 9. Finishing Order and Team Outcome

Players are ranked by the order in which they play all their cards. Traditional terms:

- **头游**: first place
- **次游**: second place
- **末游**: last place
- **双下**: both players on one team occupy the final two finishing positions

Team outcome and level advancement depend on finishing order. The specified advancement rules are in the next section.

## 10. Level Progression

The level ranks progress in this order:

**2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → J → Q → K → A**

Team A and Team B maintain separate stored progression levels and may be at different levels. The team containing the previous round's first-place finisher is the winning team for that round and is the only team that advances. The other team keeps its existing stored level: it neither advances nor decreases, except that its own three-failed-A-attempt rule can reset it to 2.

Determine the winning team's advancement by the first-place finisher's teammate's finishing position:

- Teammate finishes 2nd (双下): advance 3 levels.
- Teammate finishes 3rd: advance 2 levels.
- Teammate finishes 4th: advance 1 level.

Advancement cannot skip A. A is the maximum level; if applying an advancement would move beyond A, cap the team's level at A. For example, J + 3 levels, Q + 2 or 3 levels, and K + 2 or 3 levels all result in A. The team must still successfully complete the A-level victory condition; reaching A does not itself win the match.

After processing the winning team's advancement (including capping at A), the next round's Current Level Rank is the applicable level of the team containing the previous round's first-place finisher. The other team's stored level does not determine the active rank for that round.

Example: if Team A is at level 5 and one of its players finishes first while their teammate finishes third, Team A advances two levels to 7; Team B's level stays unchanged. The next round's Current Level Rank is 7.

## 11. A-Level and Match Victory

A is the final level. Reaching A alone does not end the match. While playing at A, a team successfully completes A only if one of its players finishes first and the teammate does not finish last. The match ends when a team successfully completes A under this condition.

Each team maintains its own A-level failure state. If a team is playing at A and does not successfully complete A, increment that team's consecutive failed-A-attempt count. After three failures, that team resets to level 2 and its failed-attempt count resets with the level reset. This does not automatically reset the opposing team's stored level. The next round's active Current Level Rank still comes from the applicable level of the team containing the previous round's first-place finisher, after the relevant advancement or reset is processed.

No match-ending logic is implemented by this document.

## 12. Tribute, Return Tribute, Anti-Tribute, and Next-Round Lead

These rules apply based on the finishing result of the previous round. Terms used below: **头游** means the first-place finisher, **末游** means the last-place finisher, **双下** means both members of one team occupy the final two finishing positions, **进贡** means Tribute, **还贡** means Return Tribute, and **抗贡** means Anti-Tribute.

### Return Tribute Card Eligibility (还贡)

When a winning player must return a card after receiving Tribute, the returned card must have a printed rank of 10 or lower, including 10. It must not have the Current Level Rank if that rank is 10 or lower. Do not use general card-strength order to determine eligibility: the restriction uses the card's printed rank and the Current Level Rank.

J, Q, K, A, 2, Small Joker, and Big Joker are not eligible. Ranks 10, 9, 8, 7, 6, 5, 4, and 3 are normally eligible, except the Current Level Rank is excluded when it is 10 or lower.

Examples:

- If the Current Level Rank is 6, ranks 10, 9, 8, 7, 5, 4, and 3 may be returned; rank 6 may not.
- If the Current Level Rank is 10, ranks 9, 8, 7, 6, 5, 4, and 3 may be returned; rank 10 may not.
- If the Current Level Rank is J or higher, the Level Rank exclusion does not remove any rank from the normal 10-or-lower range. For example, with Q as the Current Level Rank, ranks 10, 9, 8, 7, 6, 5, 4, and 3 remain eligible.

### Double-Down (双下)

When the previous round ends in 双下, both players on the losing team pay Tribute. Each gives one highest card from their hand to one of the two winning players, for two Tribute cards total. Each winning player then returns one eligible card to the corresponding losing player, following the [Return Tribute Card Eligibility](#return-tribute-card-eligibility) rule.

#### Double-Down Anti-Tribute (双下抗贡)

Anti-Tribute occurs if the two losing players collectively hold both Big Jokers: either each has one Big Joker, or one player has both. Tribute and Return Tribute are cancelled. The previous round's 头游 leads the new round.

#### Double-Down Lead After Normal Tribute

If there is no Anti-Tribute, compare the two cards paid as Tribute using the normal card-strength rules, unless a later rule explicitly overrides them. The player who gave the higher Tribute card leads the new round. If the Tribute cards are equal in strength, randomly select one of the two Tribute-paying players to lead.

### Single-Down (单下)

When only one opposing player finished last, the 末游 gives one highest card to the winner. The winner returns one eligible card to the 末游, following the [Return Tribute Card Eligibility](#return-tribute-card-eligibility) rule.

#### Single-Down Anti-Tribute (单下抗贡)

If the 末游 holds both Big Jokers, Anti-Tribute occurs. Tribute and Return Tribute are cancelled. The previous round's 头游 leads the new round.

#### Single-Down Lead After Normal Tribute

If there is no Anti-Tribute, the Tribute giver, who is the previous round's 末游, leads the new round.

### Next-Round Lead Summary
These rules determine who leads the next round; they do not determine who leads a new trick within an ongoing round.

- Double-Down with no Anti-Tribute: the giver of the higher Tribute card leads; if the cards are equal in strength, randomly select one of the two Tribute givers.
- Single-Down with no Anti-Tribute: the Tribute giver / previous 末游 leads.
- Any Anti-Tribute situation: the previous 头游 leads.

These Tribute mechanics are documented but are not implemented here.

## 13. First-Round Lead

For the first round only, after the deck is shuffled, one physical card among the 108 cards is randomly designated as the revealed starting card. Cards are then dealt normally. The player who receives the designated card leads the first trick. The card remains in that player's hand and is not removed from play. The UI may visually reveal or highlight the card during the dealing sequence.

## 14. Beginner Experience and Contextual Teaching

A new player should be able to learn through the interface without requiring the developer to explain the rules personally. Do not achieve this by removing Guandan's defining combinations or strategic choices. Players should not have to read a long rulebook before entering a room; teach relevant rules in context during play.

The interface should describe the required response, for example:

- After a Pair of 8s: “Play a higher Pair, a Bomb, or Pass.”
- After Consecutive Pairs: “Play higher Consecutive Pairs, a Bomb, or Pass.”
- After a Straight: “Play a higher 5-card Straight, a Bomb, or Pass.”
- When leading a new trick: “You may play any valid combination.”
- For an invalid selection: “These cards do not form a valid Guandan combination.”

The eventual experience should help players recognize legal actions: highlight cards that can participate in legal responses, identify the selected combination, disable Play for an illegal selection, explain invalid selections, show the previous play, and explain why a selection can or cannot beat it.

The rules engine, not React UI, must determine legality. The UI displays the engine's result. Whenever a wildcard is used, explain its interpretation. For example: “Heart 10 is acting as 5, forming a 2-3-4-5-6 Straight.”

## 15. Hint System (Future Behavior)

The game should eventually include a Hint action that recommends a move and explains why. For example: “Play J-J. It beats the current Pair of 9s and preserves your Bomb.” Do not implement AI or hint logic as part of this rules document.

## 16. Architecture Boundary (For Later Implementation)

When implementation begins, keep the rules engine separate from React UI and multiplayer networking:

```text
src/game/       Pure, deterministic Guandan rules
src/components/ Presentation only
src/server/     Authoritative multiplayer room/session state
src/ai/         AI player, strategy hints, post-game analysis
```

The UI must not independently decide whether a play is legal, and the server must not duplicate the rules. The rules engine is intended to be authoritative for combination recognition, wildcard resolution, legal move validation, play and Bomb comparison, turn progression, finishing order, level progression, and match-ending conditions.

## 17. Implementation Notes

Keep these concepts distinct in the eventual implementation:

1. General card strength
2. Sequence ordering
3. Current Level Rank behavior
4. Bomb-size comparison
5. Equal-size Rank Bomb rank comparison
6. Wildcard interpretation

For example, general card strength puts the Current Level Rank above 2, while sequence ordering puts `A-2-3-4-5` at the bottom and `10-J-Q-K-A` at the top. Do not create one universal rank number and reuse it for every rule.

## NEEDS DECISION

No additional wildcard legality questions are currently identified as unresolved by the authoritative rules in this document.

## Contradictions

No direct contradiction was identified in the supplied rules. The remaining missing details above are left open rather than resolved by assumption.
