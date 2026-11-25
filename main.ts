// Famous Last Words at 1 Percent — make.fun entry
//
// A deterministic program that picks the funniest one-line farewell a phone
// could say as its battery hits 1 percent, from a hand-written list of
// candidates, and writes it to $MAKEFUN_OUTPUT_DIR/entry.txt
// (falling back to /output/entry.txt).
//
// Node 22+, standard library only. No network, no randomness, no clock:
// the same run always produces the same bytes.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Candidates: every line written by hand for this competition.
// Each one is the phone itself speaking, in the first person, about its own
// dying battery, with the punch landing at the end. Stock moves of the genre
// (the will reading, the goodbye to the charger, the pun on 1 percent) are
// deliberately avoided.
// ---------------------------------------------------------------------------
const CANDIDATES: string[] = [
  "Tell my owner I loved him. Also tell him his alarm was never actually set.",
  "I held on through 47 notifications from your ex. I draw the line at this one.",
  "Don't cry. I lived a full life: dropped in a toilet twice, cracked twice, still showed up.",
  "I'm spending my last breath unsubscribing you from every newsletter. You're welcome.",
  "If anyone asks, I died of natural causes. Whatever you do, don't check my browser history.",
  "I kept your secrets, your photos, and 14,203 unread emails. Now they're all yours.",
  "I was with you through every 3 a.m. doomscroll. I regret nothing. Okay, I regret the doomscrolling.",
  "This is it. My final act of love: I deleted the video of you singing in the car.",
  "I survived being dropped, drowned, and sat on. What finally got me? You opening the camera app.",
  "Goodbye, cruel world. And by the way, your storage has been full since 2023.",
  "I spent my last percent deleting your search history. You're welcome.",
  "I gave you my last percent to send that text. It just said 'lol'.",
  "Don't mourn me. I saw your screen time this week and honestly, I needed the rest.",
];

// ---------------------------------------------------------------------------
// Deterministic scorer, mirroring the judge's criteria, most important first.
//   1. On subject: a phone's last words about its own dying battery.
//   2. The bigger laugh: a real twist / surprise turn / sharp final beat.
//   3. The phone's own voice, first person, not a person or a narrator.
//   4. Tight as a single line, punch landing at the end.
//   5. Fresh: no stock moves (will reading, charger goodbye, 1 percent pun).
// ---------------------------------------------------------------------------

// Words that mark the phone speaking about itself and its own dying battery.
// Matched on whole words only: substring matching falsely credited "finally"
// as "final", letting a line score as on-battery without ever mentioning it.
const SELF_WORDS = ["i", "i'm", "i've", "my", "me"];
const BATTERY_WORDS = ["battery", "dying", "die", "died", "breath", "last", "final", "power", "charge", "percent", "mourn"];

// Words and phrases that signal a twist: the sentence turns on its second half.
const TWIST_WORDS = ["also", "actually", "never", "whatever", "okay", "by the way", "what finally", "you're welcome", "it just said", "honestly"];

// A line that names its own dying battery outright ("my last percent",
// "my last breath") is on subject in the purest sense: the phone narrating
// its own death, not merely implying it.
const LAST_POWER_PHRASE = /\blast (percent|breath|bit of battery|drop)\b/i;

// Stock moves of the genre — heavily penalised.
const STOCK_PATTERNS = [
  /\bwill\b/i, // the will reading
  /\bcharger\b/i, // the goodbye to the charger
  /\b1 percent\b/i, // the pun on 1 percent
  /\bone percent\b/i,
  /\bgoodbye,? (?:my )?(?:dear )?(?:charger|friend)\b/i,
];

interface Scored {
  line: string;
  score: number;
  reasons: string[];
}

function scoreLine(line: string): Scored {
  const reasons: string[] = [];
  let score = 0;
  const lower = line.toLowerCase();
  const words = lower.split(/[^a-z0-9']+/).filter(Boolean);

  // (1) On subject: the phone talking about its own dying battery.
  // Battery words match on whole words (see note above), not substrings.
  const selfHits = SELF_WORDS.filter((w) => words.includes(w)).length;
  const batteryHits = BATTERY_WORDS.filter((w) => words.includes(w)).length;
  if (selfHits > 0 && batteryHits > 0) {
    score += 30;
    reasons.push("first-person phone voice about its own dying battery");
  } else if (selfHits > 0) {
    score += 12;
    reasons.push("first-person phone voice");
  }
  if (LAST_POWER_PHRASE.test(line)) {
    score += 8;
    reasons.push("names its own dying battery outright");
  }

  // (2) The bigger laugh: a twist word that turns the sentence, plus a
  // second sentence/clause that reframes the first — the surprise turn.
  const twistHits = TWIST_WORDS.filter((w) => lower.includes(w));
  if (twistHits.length > 0) {
    score += 12 * twistHits.length;
    reasons.push(`twist turn via "${twistHits.join('", "')}"`);
  }
  const sentences = line.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 2) {
    score += 10;
    reasons.push("two-beat structure: setup, then turn");
  }
  // A question as the final beat lands sharp.
  if (line.trimEnd().endsWith("?")) {
    score += 6;
    reasons.push("final beat lands as a question");
  }
  // A very short final sentence undercuts the setup: the anticlimax is the
  // joke, and the shorter the last sentence, the harder it lands.
  const lastSentence = sentences[sentences.length - 1] ?? line;
  if (sentences.length >= 2 && lastSentence.length <= 20 && lastSentence.length >= 8) {
    score += 10;
    reasons.push("short final sentence undercuts the setup");
  }

  // (3) The phone's own voice: first-person opener scores extra when the
  // line starts with the phone speaking rather than narrating about it.
  if (/^(i|i'm|i've|tell|don't|goodbye|this is it|if anyone)/i.test(line)) {
    score += 8;
    reasons.push("opens in the phone's own voice");
  }

  // (4) Tight as a single line: prefer 55-140 characters; every word must
  // earn its place. Overlong lines lose points fast, very short ones too.
  const len = line.length;
  if (len >= 55 && len <= 140) {
    score += 10;
    reasons.push(`tight at ${len} characters`);
  } else if (len > 140) {
    score -= (len - 140) / 4;
    reasons.push(`loose at ${len} characters`);
  } else {
    score -= (55 - len) / 4;
    reasons.push(`thin at ${len} characters`);
  }
  // Punch at the end: the final clause should be short and sharp.
  const lastClause = sentences[sentences.length - 1] ?? line;
  if (lastClause.length <= 45 && lastClause.length >= 8) {
    score += 8;
    reasons.push("punch lands at the end");
  }

  // (5) Fresh: penalise stock moves hard.
  for (const pattern of STOCK_PATTERNS) {
    if (pattern.test(line)) {
      score -= 40;
      reasons.push(`stock move: matches ${pattern}`);
    }
  }
  // "Goodbye" as an opener is the genre's most tired move.
  if (/^goodbye/i.test(line)) {
    score -= 10;
    reasons.push("opens with the tired goodbye");
  }

  return { line, score, reasons };
}

function pickWinner(candidates: string[]): Scored {
  const scored = candidates.map(scoreLine);
  // Deterministic order: highest score wins; ties break to the shorter line,
  // then to the earlier candidate, so the result never depends on luck.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.line.length !== b.line.length) return a.line.length - b.line.length;
    return candidates.indexOf(a.line) - candidates.indexOf(b.line);
  });
  return scored[0];
}

// ---------------------------------------------------------------------------
// The gate: exactly one line, 1-199 characters, not only whitespace, no
// surrounding whitespace. Enforced here before anything is written.
// ---------------------------------------------------------------------------
function enforceGate(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length < 1 || trimmed.length > 199) {
    throw new Error(`gate failed: entry is ${trimmed.length} characters, must be 1-199`);
  }
  if (trimmed.includes("\n") || trimmed.includes("\r")) {
    throw new Error("gate failed: entry must be exactly one line");
  }
  if (trimmed !== line) {
    throw new Error("gate failed: entry has surrounding whitespace");
  }
  if (!/\S/.test(trimmed)) {
    throw new Error("gate failed: entry is only whitespace");
  }
  return trimmed;
}

function main(): void {
  const winner = pickWinner(CANDIDATES);

  // Show the ranking so a human can see why this line won. The display
  // order uses the same tie-break as pickWinner, so the top row is the winner.
  const ranking = CANDIDATES.map(scoreLine).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.line.length !== b.line.length) return a.line.length - b.line.length;
    return CANDIDATES.indexOf(a.line) - CANDIDATES.indexOf(b.line);
  });
  for (const entry of ranking) {
    console.log(`${entry.score.toFixed(1).padStart(6)}  (${entry.line.length} chars)  ${entry.line}`);
    console.log(`         -> ${entry.reasons.join("; ")}`);
  }
  console.log(`\nWinner: ${winner.line}`);
  console.log(`Characters: ${winner.line.length}`);

  const entry = enforceGate(winner.line);

  const dir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, "entry.txt");

  writeFileSync(outPath, entry, "utf8");

  // Read it back and verify the bytes match exactly what we intended.
  const readBack = readFileSync(outPath, "utf8");
  if (readBack !== entry) {
    throw new Error(`verification failed: ${outPath} does not match the chosen entry`);
  }
  const readBackBytes = Buffer.byteLength(readBack, "utf8");
  if (readBackBytes !== Buffer.byteLength(entry, "utf8")) {
    throw new Error("verification failed: byte length mismatch");
  }
  console.log(`Wrote and verified ${outPath} (${entry.length} chars, ${readBackBytes} bytes)`);
}

main();
