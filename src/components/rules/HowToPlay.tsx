"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type {
  Card as GameCard,
  DeckIndex,
  JokerRank,
  OrdinaryRank,
  Suit,
} from "../../game/types";
import { Card } from "../game/Card";
import styles from "./HowToPlay.module.css";

type HowToPlayProps = {
  onClose: () => void;
};

type CardSpec = readonly [OrdinaryRank, Suit, DeckIndex?];

const sections = [
  ["quick-start", "Quick Start"],
  ["who-plays-first", "Who Plays First?"],
  ["teams-goal", "Teams & Goal"],
  ["turns", "Turns & Passing"],
  ["combinations", "Legal Combinations"],
  ["beating", "How to Beat a Play"],
  ["level-wild", "Level & Wildcard"],
  ["bombs", "Bombs"],
  ["finishing", "Finishing & Progression"],
  ["tribute", "Tribute"],
  ["winning", "Winning at Ace"],
] as const;

function suited(
  id: string,
  rank: OrdinaryRank,
  suit: Suit,
  deckIndex: DeckIndex = 0,
): GameCard {
  return { id, rank, suit, deckIndex, kind: "SUITED", isJoker: false };
}

function joker(id: string, rank: JokerRank, deckIndex: DeckIndex): GameCard {
  return { id, rank, suit: null, deckIndex, kind: "JOKER", isJoker: true };
}

function cards(prefix: string, specs: readonly CardSpec[]): GameCard[] {
  return specs.map(([rank, suit, deckIndex = 0], index) =>
    suited(`${prefix}-${index}`, rank, suit, deckIndex));
}

function CardLine({
  label,
  cards: exampleCards,
  note,
}: {
  label: string;
  cards: readonly GameCard[];
  note?: string;
}) {
  return (
    <figure className={styles.cardExample}>
      <figcaption>
        <strong>{label}</strong>
        {note ? <span>{note}</span> : null}
      </figcaption>
      <div className={styles.cards} aria-label={`${label} example`}>
        {exampleCards.map((card) => (
          <Card key={card.id} card={card} currentLevelRank="6" compact disabled />
        ))}
      </div>
    </figure>
  );
}

function RuleSection({
  id,
  step,
  title,
  children,
}: {
  id: string;
  step: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section} tabIndex={-1}>
      <div className={styles.sectionHeading}>
        <span>{step}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function HowToPlay({ onClose }: HowToPlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  function goToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
        aria-describedby="how-to-play-summary"
      >
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>Beginner table guide</span>
            <h2 id="how-to-play-title">How to Play Guandan</h2>
            <p id="how-to-play-summary">
              Learn the table flow first, then open the advanced rules when you need them.
            </p>
          </div>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className={styles.srOnly}>Close rules</span>
          </button>
        </header>

        <div className={styles.body}>
          <nav className={styles.nav} aria-label="Tutorial sections">
            {sections.map(([id, label], index) => (
              <button key={id} type="button" onClick={() => goToSection(id)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {label}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            <RuleSection id="quick-start" step="01" title="Quick Start">
              <div className={styles.calloutGrid}>
                <div><strong>1. Lead</strong><span>Open a fresh trick with any legal combination.</span></div>
                <div><strong>2. Respond</strong><span>Play the same type at higher strength, play a Bomb, or Pass.</span></div>
                <div><strong>3. Finish</strong><span>Empty your hand and help your opposite-seat partner finish well.</span></div>
              </div>
              <p>A round uses two decks: 108 physical cards, with 27 cards dealt to each player.</p>
            </RuleSection>

            <RuleSection id="who-plays-first" step="02" title="Who Plays First?">
              <p>
                Round 1 begins with a public opening ceremony before anyone receives a hand. Dice
                choose the <strong>Flipper</strong>; one physical card from the still-undealt deck
                chooses the first leader; only then are all 108 cards dealt.
              </p>
              <div className={styles.openingFlow} aria-label="Round 1 opening order">
                <div><span>01</span><strong>Roll two dice</strong><small>All four players</small></div>
                <b aria-hidden="true">→</b>
                <div><span>02</span><strong>Highest flips</strong><small>One physical card</small></div>
                <b aria-hidden="true">→</b>
                <div><span>03</span><strong>Count clockwise</strong><small>Flipper counts as 1</small></div>
                <b aria-hidden="true">→</b>
                <div><span>04</span><strong>Deal 27 each</strong><small>Then Round 1 starts</small></div>
              </div>
              <ol className={styles.openingSteps}>
                <li>Before dealing, all four players roll two six-sided dice.</li>
                <li>The unique highest total becomes the Flipper.</li>
                <li>If the highest total is tied, only those tied-highest players reroll two dice until one wins.</li>
                <li>The Flipper reveals the top physical card of the complete 108-card deck.</li>
                <li>Ace has opening value 1.</li>
                <li>Ranks 2 through 10 use their printed number.</li>
                <li>Jack is 11, Queen is 12, and King is 13.</li>
                <li>Count clockwise from the Flipper, with the Flipper counting as 1.</li>
                <li>Small Joker means “yourself”: the Flipper leads.</li>
                <li>Big Joker also means “yourself”: the Flipper leads.</li>
                <li>The resulting seat becomes the Round 1 leader.</li>
                <li>Then the same complete deck is dealt, 27 cards to each player.</li>
              </ol>
              <div className={styles.openingRulesGrid}>
                <div className={styles.faceValues}>
                  <strong>Printed face values</strong>
                  <span>A = 1</span><span>2–10 = printed number</span>
                  <span>J = 11</span><span>Q = 12</span><span>K = 13</span>
                  <small>The Current Level never changes this opening count.</small>
                </div>
                <div className={styles.clockwiseExample}>
                  <strong>Example · Flipper is Player 2 · Card is 4</strong>
                  <div><span>1<br /><b>Player 2</b></span><span>2<br /><b>Player 3</b></span><span>3<br /><b>Player 4</b></span><span className={styles.exampleWinner}>4<br /><b>Player 1 leads</b></span></div>
                </div>
              </div>
              <div className={styles.ruleNotice}>
                <strong>The revealed card never creates a 109th card.</strong>
                <span>It stays in the same complete deck and is dealt normally. Whoever eventually receives it does not determine who starts.</span>
              </div>
              <CardLine label="Joker = Yourself" note="Red Big Joker or Black Small Joker: the Flipper leads without a numeric count" cards={[
                joker("opening-big", "BIG_JOKER", 0),
                joker("opening-small", "SMALL_JOKER", 0),
              ]} />
            </RuleSection>

            <RuleSection id="teams-goal" step="03" title="Teams & Goal">
              <p>
                Four players form two partnerships. Opposite seats are teammates: Players 1 and 3
                are Team A; Players 2 and 4 are Team B. Your team advances through the levels by
                taking first place and securing the best possible finish for the first player’s partner.
              </p>
              <div className={styles.teamDiagram} aria-label="Opposite seats are partners">
                <span>Player 3 · Team A</span>
                <span>Player 2 · Team B</span>
                <strong>Partners sit opposite</strong>
                <span>Player 4 · Team B</span>
                <span>Player 1 · Team A</span>
              </div>
            </RuleSection>

            <RuleSection id="turns" step="04" title="Turns, Passing & Tricks">
              <p>
                On your turn, beat the current play, use a legal Bomb, or Pass. You may Pass even
                when you can play. Once every other active player passes, the current highest play
                wins the trick and normally leads the next fresh trick.
              </p>
              <p>
                If the trick winner emptied their hand, that player’s teammate leads the next trick.
                Finished players leave the turn rotation and never need to Pass.
              </p>
              <div className={styles.calloutGrid}>
                <div><strong>Gold turn marker</strong><span>The illuminated pointer and seat glow show exactly who must act.</span></div>
                <div><strong>60-second clock</strong><span>On timeout, a response auto-Passes; a fresh lead plays the weakest legal Single.</span></div>
                <div><strong>Arrange your hand</strong><span>Drag cards on desktop. On touch, choose Arrange first so scrolling never reorders by accident.</span></div>
              </div>
              <p>
                Select cards once, review the compact selection summary, then confirm with Play.
                Pass is unavailable while leading. Desktop shortcuts are Enter for Play, Escape for
                Clear, and P for a legal Pass.
              </p>
            </RuleSection>

            <RuleSection id="combinations" step="05" title="Legal Combinations">
              <p>Every normal response must match the current combination type. Physical card counts are exact.</p>
              <div className={styles.exampleGrid}>
                <CardLine label="Single" cards={cards("single", [["8", "SPADES"]])} />
                <CardLine label="Pair" cards={cards("pair", [["8", "SPADES"], ["8", "HEARTS"]])} />
                <CardLine label="Triple" cards={cards("triple", [["9", "SPADES"], ["9", "HEARTS"], ["9", "CLUBS"]])} />
                <CardLine label="Full House" note="Triple + Pair; compare the Triple" cards={cards("full", [["Q", "SPADES"], ["Q", "HEARTS"], ["Q", "CLUBS"], ["4", "DIAMONDS"], ["4", "CLUBS"]])} />
                <CardLine label="Straight" note="Exactly 5 consecutive ranks" cards={cards("straight", [["3", "SPADES"], ["4", "HEARTS"], ["5", "CLUBS"], ["6", "DIAMONDS"], ["7", "SPADES"]])} />
                <CardLine label="Consecutive Pairs" note="Exactly 3 pairs / 6 cards" cards={cards("pairs", [["5", "SPADES"], ["5", "HEARTS"], ["6", "CLUBS"], ["6", "DIAMONDS"], ["7", "SPADES"], ["7", "HEARTS"]])} />
                <CardLine label="Gangban · Triple Sequence" note="Exactly 2 consecutive Triples" cards={cards("gangban", [["8", "SPADES"], ["8", "HEARTS"], ["8", "CLUBS"], ["9", "SPADES"], ["9", "HEARTS"], ["9", "CLUBS"]])} />
                <CardLine label="Rank Bomb" note="4 or more cards of one interpreted rank" cards={cards("rank-bomb", [["K", "SPADES"], ["K", "HEARTS"], ["K", "CLUBS"], ["K", "DIAMONDS"]])} />
                <CardLine label="Straight Flush Bomb" note="Exactly 5 consecutive cards, same effective suit" cards={cards("flush", [["7", "SPADES"], ["8", "SPADES"], ["9", "SPADES"], ["10", "SPADES"], ["J", "SPADES"]])} />
                <CardLine label="Four-Joker Bomb" note="Both real Small Jokers + both real Big Jokers" cards={[
                  joker("small-0", "SMALL_JOKER", 0),
                  joker("small-1", "SMALL_JOKER", 1),
                  joker("big-0", "BIG_JOKER", 0),
                  joker("big-1", "BIG_JOKER", 1),
                ]} />
              </div>
            </RuleSection>

            <RuleSection id="beating" step="06" title="How to Beat a Play">
              <div className={styles.comparison}>
                <div>
                  <CardLine label="Pair of 8s" cards={cards("low-pair", [["8", "CLUBS"], ["8", "DIAMONDS"]])} />
                  <span aria-hidden="true">&lt;</span>
                  <CardLine label="Pair of 9s" cards={cards("high-pair", [["9", "CLUBS"], ["9", "DIAMONDS"]])} />
                </div>
                <p><strong>Pair 9 beats Pair 8.</strong> Same type, same card count, higher rank.</p>
              </div>
              <div className={styles.ruleNotice}>
                <strong>Triple 9 does not beat Pair 8.</strong>
                <span>Higher cards do not matter when the normal combination type is different. Bombs are the exception.</span>
              </div>
            </RuleSection>

            <RuleSection id="level-wild" step="07" title="Current Level & Heart Wildcard">
              <p>
                The match status names the <strong>active-level team</strong> as well as both teams’
                stored levels. “Team A · 7” as the Current Level is separate from a player’s
                competitive Rating tier.
              </p>
              <p>
                Example: the Current Level is <strong>6</strong>. Rank-based strength is:
              </p>
              <div className={styles.rankOrder}>
                Big Joker <b>›</b> Small Joker <b>›</b> 6 <b>›</b> A <b>›</b> K <b>›</b> Q
                <b>›</b> J <b>›</b> 10 <b>›</b> 9 <b>›</b> 8 <b>›</b> 7 <b>›</b> 5
                <b>›</b> 4 <b>›</b> 3 <b>›</b> 2
              </div>
              <p>
                The Level Rank moves above Ace and is removed from its usual position. It does not
                change sequence adjacency: 5-6-7-8-9 is still consecutive.
              </p>
              <CardLine
                label="Heart 6 acts as J♠"
                note="7♠ 8♠ 9♠ 10♠ ♥6 → a 7-to-J Straight Flush"
                cards={cards("wild-flush", [["7", "SPADES"], ["8", "SPADES"], ["9", "SPADES"], ["10", "SPADES"], ["6", "HEARTS"]])}
              />
              <ul>
                <li>The Heart card matching the Current Level is the wildcard; both physical copies may be used.</li>
                <li>It may represent an ordinary non-Joker card, including an effective suit, but never a Joker.</li>
                <li>Played alone, it remains its printed Level Rank. The table always shows a chosen wildcard interpretation.</li>
              </ul>
            </RuleSection>

            <RuleSection id="bombs" step="08" title="Bomb Hierarchy">
              <p className={styles.bombOrder}>
                Normal play <b>‹</b> 4-card Rank Bomb <b>‹</b> 5-card Rank Bomb <b>‹</b>
                Straight Flush <b>‹</b> any 6+ Rank Bomb <b>‹</b> Four-Joker Bomb
              </p>
              <p>
                A larger Rank Bomb beats a smaller one regardless of rank. Only equal-size Rank Bombs
                compare their interpreted rank. The Four-Joker Bomb is always strongest.
              </p>
            </RuleSection>

            <RuleSection id="finishing" step="09" title="Finishing & Level Progression">
              <p>The team containing the first-place finisher advances according to where that player’s teammate finishes:</p>
              <div className={styles.progressionGrid}>
                <div><span>Teammate 2nd</span><strong>+3 levels</strong></div>
                <div><span>Teammate 3rd</span><strong>+2 levels</strong></div>
                <div><span>Teammate last</span><strong>+1 level</strong></div>
              </div>
              <p className={styles.levelTrack}>2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → J → Q → K → A</p>
              <p>Levels never skip beyond Ace. The other team keeps its own stored level.</p>
            </RuleSection>

            <RuleSection id="tribute" step="10" title="Tribute, Return Tribute & Anti-Tribute">
              <p>
                From round two onward, newly dealt hands are checked before play. The payer gives the
                highest eligible Single. In a normal Single-Down, the last-place player pays first place,
                receives one card back, and leads. In Double-Down, both losing teammates pay; the stronger
                Tribute goes to first place, the other to second place, each recipient returns a card to
                the corresponding payer, and the stronger payer leads. Equal Tribute ranks have no suit
                tiebreaker; resolution is restricted to the two payers.
              </p>
              <div className={styles.ruleNotice}>
                <strong>Return-Tribute eligibility uses printed rank.</strong>
                <span>
                  Normally, 2 through 10 are legal. Exclude the printed Current Level only when it is
                  within 2–10. J, Q, K, A and Jokers are not normally eligible. A non-Level 2 is a normal
                  legal return card—not fallback-only.
                </span>
              </div>
              <p>
                Fallback applies only when the returner has zero normally eligible cards. Only then must
                they return one of their weakest Singles using normal rank strength.
              </p>
              <ul>
                <li><strong>Single-Down Anti-Tribute:</strong> the last-place player holds both physical Big Jokers.</li>
                <li><strong>Double-Down Anti-Tribute:</strong> the two losing teammates together hold both physical Big Jokers.</li>
                <li>Anti-Tribute cancels both transfers; the previous first-place finisher leads.</li>
              </ul>
            </RuleSection>

            <RuleSection id="winning" step="11" title="Winning at Ace">
              <p>
                Reaching Ace is not an instant win. While playing at Ace, your team must take first place
                and your teammate must avoid last place. That successful Ace round wins the match.
              </p>
              <p>
                Each team tracks its own consecutive failed Ace attempts. After three failures, that team
                resets to level 2; the other team’s stored level is not reset.
              </p>
              <button type="button" className={styles.done} onClick={onClose}>Ready for the table</button>
            </RuleSection>
          </div>
        </div>
      </div>
    </div>
  );
}
