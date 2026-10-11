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
import { useI18n } from "../i18n/I18nProvider";
import styles from "./HowToPlay.module.css";

type HowToPlayProps = {
  onClose: () => void;
};

type CardSpec = readonly [OrdinaryRank, Suit, DeckIndex?];

const sections = [
  ["quick-start", "rules.section.quick"],
  ["who-plays-first", "rules.section.opening"],
  ["teams-goal", "rules.section.teams"],
  ["turns", "rules.section.turns"],
  ["combinations", "rules.section.combinations"],
  ["beating", "rules.section.beating"],
  ["level-wild", "rules.section.level"],
  ["bombs", "rules.section.bombs"],
  ["finishing", "rules.section.finishing"],
  ["tribute", "rules.section.tribute"],
  ["winning", "rules.section.winning"],
] as const;

const openingStepKeys = [
  "rules.opening.step1",
  "rules.opening.step2",
  "rules.opening.step3",
  "rules.opening.step4",
  "rules.opening.step5",
  "rules.opening.step6",
  "rules.opening.step7",
  "rules.opening.step8",
  "rules.opening.step9",
  "rules.opening.step10",
  "rules.opening.step11",
  "rules.opening.step12",
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
  const { t } = useI18n();
  return (
    <figure className={styles.cardExample}>
      <figcaption>
        <strong>{label}</strong>
        {note ? <span>{note}</span> : null}
      </figcaption>
      <div className={styles.cards} aria-label={t("rules.example", { label })}>
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
  const { t } = useI18n();
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
            <span className={styles.kicker}>{t("rules.kicker")}</span>
            <h2 id="how-to-play-title">{t("rules.title")}</h2>
            <p id="how-to-play-summary">
              {t("rules.summary")}
            </p>
          </div>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className={styles.srOnly}>{t("rules.close")}</span>
          </button>
        </header>

        <div className={styles.body}>
          <nav className={styles.nav} aria-label={t("rules.sections")}>
            {sections.map(([id, key], index) => (
              <button key={id} type="button" onClick={() => goToSection(id)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {t(key)}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            <RuleSection id="quick-start" step="01" title={t("rules.section.quick")}>
              <div className={styles.calloutGrid}>
                <div><strong>{t("rules.quick.lead")}</strong><span>{t("rules.quick.leadText")}</span></div>
                <div><strong>{t("rules.quick.respond")}</strong><span>{t("rules.quick.respondText")}</span></div>
                <div><strong>{t("rules.quick.finish")}</strong><span>{t("rules.quick.finishText")}</span></div>
              </div>
              <p>{t("rules.quick.deck")}</p>
            </RuleSection>

            <RuleSection id="who-plays-first" step="02" title={t("rules.section.opening")}>
              <p>{t("rules.opening.intro")}</p>
              <div className={styles.openingFlow} aria-label={t("rules.opening.order")}>
                <div><span>01</span><strong>{t("rules.opening.flowRoll")}</strong><small>{t("rules.opening.flowAll")}</small></div>
                <b aria-hidden="true">→</b>
                <div><span>02</span><strong>{t("rules.opening.flowHighest")}</strong><small>{t("rules.opening.flowOne")}</small></div>
                <b aria-hidden="true">→</b>
                <div><span>03</span><strong>{t("rules.opening.flowCount")}</strong><small>{t("rules.opening.flowFlipper")}</small></div>
                <b aria-hidden="true">→</b>
                <div><span>04</span><strong>{t("rules.opening.flowDeal")}</strong><small>{t("rules.opening.flowStart")}</small></div>
              </div>
              <ol className={styles.openingSteps}>
                {openingStepKeys.map((key) => <li key={key}>{t(key)}</li>)}
              </ol>
              <div className={styles.openingRulesGrid}>
                <div className={styles.faceValues}>
                  <strong>{t("rules.opening.faceValues")}</strong>
                  <span>A = 1</span><span>{t("rules.opening.twoTen")}</span>
                  <span>J = 11</span><span>Q = 12</span><span>K = 13</span>
                  <small>{t("rules.opening.levelNoChange")}</small>
                </div>
                <div className={styles.clockwiseExample}>
                  <strong>{t("rules.opening.example")}</strong>
                  <div><span>1<br /><b>{t("common.player", { number: 2 })}</b></span><span>2<br /><b>{t("common.player", { number: 3 })}</b></span><span>3<br /><b>{t("common.player", { number: 4 })}</b></span><span className={styles.exampleWinner}>4<br /><b>{t("rules.opening.playerLeads")}</b></span></div>
                </div>
              </div>
              <div className={styles.ruleNotice}>
                <strong>{t("rules.opening.no109")}</strong>
                <span>{t("rules.opening.no109Text")}</span>
              </div>
              <CardLine label={t("rules.opening.jokerLabel")} note={t("rules.opening.jokerNote")} cards={[
                joker("opening-big", "BIG_JOKER", 0),
                joker("opening-small", "SMALL_JOKER", 0),
              ]} />
            </RuleSection>

            <RuleSection id="teams-goal" step="03" title={t("rules.section.teams")}>
              <p>{t("rules.teams.body")}</p>
              <div className={styles.teamDiagram} aria-label={t("rules.teams.opposite")}>
                <span>{t("common.player", { number: 3 })} · {t("common.teamA")}</span>
                <span>{t("common.player", { number: 2 })} · {t("common.teamB")}</span>
                <strong>{t("rules.teams.partnerSit")}</strong>
                <span>{t("common.player", { number: 4 })} · {t("common.teamB")}</span>
                <span>{t("common.player", { number: 1 })} · {t("common.teamA")}</span>
              </div>
            </RuleSection>

            <RuleSection id="turns" step="04" title={t("rules.section.turns")}>
              <p>{t("rules.turns.body1")}</p>
              <p>{t("rules.turns.body2")}</p>
              <div className={styles.calloutGrid}>
                <div><strong>{t("rules.turns.gold")}</strong><span>{t("rules.turns.goldText")}</span></div>
                <div><strong>{t("rules.turns.clock")}</strong><span>{t("rules.turns.clockText")}</span></div>
                <div><strong>{t("rules.turns.arrange")}</strong><span>{t("rules.turns.arrangeText")}</span></div>
              </div>
              <p>{t("rules.turns.controls")}</p>
            </RuleSection>

            <RuleSection id="combinations" step="05" title={t("rules.section.combinations")}>
              <p>{t("rules.combinations.intro")}</p>
              <div className={styles.exampleGrid}>
                <CardLine label={t("combination.SINGLE")} cards={cards("single", [["8", "SPADES"]])} />
                <CardLine label={t("combination.PAIR")} cards={cards("pair", [["8", "SPADES"], ["8", "HEARTS"]])} />
                <CardLine label={t("combination.TRIPLE")} cards={cards("triple", [["9", "SPADES"], ["9", "HEARTS"], ["9", "CLUBS"]])} />
                <CardLine label={t("combination.FULL_HOUSE")} note={t("rules.combinations.fullNote")} cards={cards("full", [["Q", "SPADES"], ["Q", "HEARTS"], ["Q", "CLUBS"], ["4", "DIAMONDS"], ["4", "CLUBS"]])} />
                <CardLine label={t("combination.STRAIGHT")} note={t("rules.combinations.straightNote")} cards={cards("straight", [["3", "SPADES"], ["4", "HEARTS"], ["5", "CLUBS"], ["6", "DIAMONDS"], ["7", "SPADES"]])} />
                <CardLine label={t("combination.CONSECUTIVE_PAIRS")} note={t("rules.combinations.pairsNote")} cards={cards("pairs", [["5", "SPADES"], ["5", "HEARTS"], ["6", "CLUBS"], ["6", "DIAMONDS"], ["7", "SPADES"], ["7", "HEARTS"]])} />
                <CardLine label={t("rules.combinations.gangban")} note={t("rules.combinations.gangbanNote")} cards={cards("gangban", [["8", "SPADES"], ["8", "HEARTS"], ["8", "CLUBS"], ["9", "SPADES"], ["9", "HEARTS"], ["9", "CLUBS"]])} />
                <CardLine label={t("combination.RANK_BOMB")} note={t("rules.combinations.rankBombNote")} cards={cards("rank-bomb", [["K", "SPADES"], ["K", "HEARTS"], ["K", "CLUBS"], ["K", "DIAMONDS"]])} />
                <CardLine label={t("rules.combinations.flushBomb")} note={t("rules.combinations.flushNote")} cards={cards("flush", [["7", "SPADES"], ["8", "SPADES"], ["9", "SPADES"], ["10", "SPADES"], ["J", "SPADES"]])} />
                <CardLine label={t("combination.FOUR_JOKER_BOMB")} note={t("rules.combinations.jokerNote")} cards={[
                  joker("small-0", "SMALL_JOKER", 0),
                  joker("small-1", "SMALL_JOKER", 1),
                  joker("big-0", "BIG_JOKER", 0),
                  joker("big-1", "BIG_JOKER", 1),
                ]} />
              </div>
            </RuleSection>

            <RuleSection id="beating" step="06" title={t("rules.section.beating")}>
              <div className={styles.comparison}>
                <div>
                  <CardLine label={t("rules.beating.pair8")} cards={cards("low-pair", [["8", "CLUBS"], ["8", "DIAMONDS"]])} />
                  <span aria-hidden="true">&lt;</span>
                  <CardLine label={t("rules.beating.pair9")} cards={cards("high-pair", [["9", "CLUBS"], ["9", "DIAMONDS"]])} />
                </div>
                <p><strong>{t("rules.beating.pairResult")}</strong> {t("rules.beating.pairWhy")}</p>
              </div>
              <div className={styles.ruleNotice}>
                <strong>{t("rules.beating.triple")}</strong>
                <span>{t("rules.beating.tripleWhy")}</span>
              </div>
            </RuleSection>

            <RuleSection id="level-wild" step="07" title={t("rules.section.level")}>
              <p>{t("rules.level.body1")}</p>
              <p>{t("rules.level.body2")}</p>
              <div className={styles.rankOrder}>
                {t("rules.level.order")}
              </div>
              <p>{t("rules.level.adjacency")}</p>
              <CardLine
                label={t("rules.level.sorted")}
                note={t("rules.level.sortedNote")}
                cards={[
                  ...cards("sorted-rest", [["K", "HEARTS"], ["A", "SPADES"]]),
                  ...cards("sorted-level", [["6", "CLUBS"], ["6", "DIAMONDS"], ["6", "HEARTS"], ["6", "SPADES"]]),
                  joker("sorted-small", "SMALL_JOKER", 0),
                  joker("sorted-big", "BIG_JOKER", 0),
                ]}
              />
              <CardLine
                label={t("rules.level.wildLabel")}
                note={t("rules.level.wildNote")}
                cards={cards("wild-flush", [["7", "SPADES"], ["8", "SPADES"], ["9", "SPADES"], ["10", "SPADES"], ["6", "HEARTS"]])}
              />
              <ul>
                <li>{t("rules.level.wild1")}</li>
                <li>{t("rules.level.wild2")}</li>
                <li>{t("rules.level.wild3")}</li>
              </ul>
            </RuleSection>

            <RuleSection id="bombs" step="08" title={t("rules.section.bombs")}>
              <p className={styles.bombOrder}>{t("rules.bombs.order")}</p>
              <p>{t("rules.bombs.body")}</p>
            </RuleSection>

            <RuleSection id="finishing" step="09" title={t("rules.section.finishing")}>
              <p>{t("rules.finishing.body")}</p>
              <div className={styles.progressionGrid}>
                <div><span>{t("rules.finishing.second")}</span><strong>{t("rules.finishing.levels", { count: 3 })}</strong></div>
                <div><span>{t("rules.finishing.third")}</span><strong>{t("rules.finishing.levels", { count: 2 })}</strong></div>
                <div><span>{t("rules.finishing.last")}</span><strong>{t("rules.finishing.levels", { count: 1 })}</strong></div>
              </div>
              <p className={styles.levelTrack}>{t("rules.finishing.track")}</p>
              <p>{t("rules.finishing.limit")}</p>
            </RuleSection>

            <RuleSection id="tribute" step="10" title={t("rules.section.tribute")}>
              <p>{t("rules.tribute.body")}</p>
              <div className={styles.ruleNotice}>
                <strong>{t("rules.tribute.eligibility")}</strong>
                <span>{t("rules.tribute.eligibilityText")}</span>
              </div>
              <p>{t("rules.tribute.fallback")}</p>
              <ul>
                <li><strong>{t("rules.tribute.singleAnti")}</strong> {t("rules.tribute.singleAntiText")}</li>
                <li><strong>{t("rules.tribute.doubleAnti")}</strong> {t("rules.tribute.doubleAntiText")}</li>
                <li>{t("rules.tribute.cancel")}</li>
              </ul>
            </RuleSection>

            <RuleSection id="winning" step="11" title={t("rules.section.winning")}>
              <p>{t("rules.winning.body1")}</p>
              <p>{t("rules.winning.body2")}</p>
              <button type="button" className={styles.done} onClick={onClose}>{t("rules.ready")}</button>
            </RuleSection>
          </div>
        </div>
      </div>
    </div>
  );
}
