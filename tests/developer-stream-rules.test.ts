import { expect, test, describe } from "bun:test";
import {
  parseRule,
  validateRule,
  matchEvent,
  matchingTags,
  eventSearchText,
  MAX_RULE_LEN,
} from "../lib/developer/stream-rules";

const coinLaunched = {
  type: "coin.launched",
  tokenId: "tok_5e6f7a8b",
  ticker: "PARTY",
  imageUrl: "https://watchparty.xyz/party.png",
};
const streamOnline = { type: "stream.online", streamId: "st_1a2b3c4d" };
const predictionResolved = {
  type: "prediction.resolved",
  question: "Will PARTY hit $1M this week?",
  winningOutcome: 0,
};

describe("parseRule", () => {
  test("splits terms and classifies operators vs keywords", () => {
    const r = parseRule("type:coin.launched PARTY -bonk");
    expect(r.terms).toEqual([
      { negate: false, field: "type", value: "coin.launched" },
      { negate: false, field: null, value: "party" },
      { negate: true, field: null, value: "bonk" },
    ]);
  });

  test("keeps quoted phrases (bare and field-scoped) intact", () => {
    const r = parseRule('question:"hit $1m" "two words"');
    expect(r.terms).toEqual([
      { negate: false, field: "question", value: "hit $1m" },
      { negate: false, field: null, value: "two words" },
    ]);
  });

  test("does not misread a non-bareword prefix as a field", () => {
    // "12:30" has digits before the colon → treated as a plain keyword.
    const r = parseRule("12:30");
    expect(r.terms).toEqual([{ negate: false, field: null, value: "12:30" }]);
  });

  test("caps the number of terms", () => {
    const many = Array.from({ length: 50 }, (_, i) => `k${i}`).join(" ");
    expect(parseRule(many).terms.length).toBeLessThanOrEqual(32);
  });
});

describe("validateRule", () => {
  test("accepts a rule with at least one positive term", () => {
    expect(validateRule("type:coin.launched -bonk")).toEqual({ ok: true });
  });

  test("rejects an empty rule", () => {
    expect(validateRule("   ").ok).toBe(false);
  });

  test("rejects an all-negation rule (would match the whole firehose)", () => {
    const v = validateRule("-bonk -scam");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("positive term");
  });

  test("rejects an over-length rule", () => {
    expect(validateRule("a".repeat(MAX_RULE_LEN + 1)).ok).toBe(false);
  });
});

describe("matchEvent", () => {
  test("field operator is exact + case-insensitive", () => {
    expect(matchEvent(parseRule("type:coin.launched"), coinLaunched)).toBe(true);
    expect(matchEvent(parseRule("TICKER:party"), coinLaunched)).toBe(true);
    expect(matchEvent(parseRule("type:stream.online"), coinLaunched)).toBe(false);
  });

  test("bare keyword is a substring over the event text", () => {
    expect(matchEvent(parseRule("party"), coinLaunched)).toBe(true);
    expect(matchEvent(parseRule("nope"), coinLaunched)).toBe(false);
  });

  test("terms are AND'd; negation excludes", () => {
    expect(matchEvent(parseRule("type:coin.launched party"), coinLaunched)).toBe(true);
    expect(matchEvent(parseRule("type:coin.launched -party"), coinLaunched)).toBe(false);
    expect(matchEvent(parseRule("type:coin.launched -bonk"), coinLaunched)).toBe(true);
  });

  test("numeric field values compare as strings", () => {
    expect(matchEvent(parseRule("winningOutcome:0"), predictionResolved)).toBe(true);
    expect(matchEvent(parseRule("winningOutcome:1"), predictionResolved)).toBe(false);
  });

  test("an all-negation rule never matches (match-time backstop)", () => {
    // parseRule yields terms but validateRule would reject; matchEvent must not
    // let it match everything.
    expect(matchEvent(parseRule("-bonk"), coinLaunched)).toBe(false);
    expect(matchEvent(parseRule(""), coinLaunched)).toBe(false);
  });
});

describe("matchingTags (OR set across an account's rules)", () => {
  const rules = [
    { value: "type:coin.launched", tag: "coins" },
    { value: "type:stream.online", tag: "lives" },
    { value: "-bonk", tag: "bad-all-negation" }, // must be ignored
    { value: "type:prediction.resolved", tag: null }, // null tag → falls back to value
  ];

  test("returns each matching rule's tag", () => {
    expect(matchingTags(rules, coinLaunched)).toEqual(["coins"]);
    expect(matchingTags(rules, streamOnline)).toEqual(["lives"]);
  });

  test("skips the all-negation rule even though it would 'match'", () => {
    expect(matchingTags(rules, coinLaunched)).not.toContain("bad-all-negation");
  });

  test("null tag falls back to the rule value", () => {
    expect(matchingTags(rules, predictionResolved)).toEqual(["type:prediction.resolved"]);
  });

  test("free-text is matched with a bare keyword, not a field operator", () => {
    // Operators are exact; a phrase inside a free-text field (question) is
    // reached with a bare keyword, which substrings the whole event text.
    expect(matchEvent(parseRule('"hit $1m"'), predictionResolved)).toBe(true);
    expect(matchEvent(parseRule('question:"hit $1m"'), predictionResolved)).toBe(false);
  });
});

describe("eventSearchText", () => {
  test("joins non-null values, lower-cased", () => {
    expect(eventSearchText(streamOnline)).toBe("stream.online st_1a2b3c4d");
  });
});
