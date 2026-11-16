import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { POSTGRES_TYPES } from "./postgres-types";

// Use the production driver's registered wire serializers, without a connection.
const sql = postgres({ types: POSTGRES_TYPES });
afterAll(() => sql.end());

describe("production Postgres JSON parameters", () => {
  const values = [
    { label: "proposal", value: { type: "transfer", amount_cents: 200000 } },
    { label: "rule checks", value: [{ rule: "R0_intent", outcome: "pass" }] },
    { label: "message parts", value: [{ kind: "card", card: { checks: [] } }] },
    { label: "empty parts", value: [] },
    { label: "JSON string", value: "A note with \"quotes\"" },
    { label: "null", value: null },
  ];

  for (const oid of [114, 3802]) {
    it.each(values)(`round-trips encoded $label through type ${oid}`, ({ value }) => {
      const wire = sql.options.serializers[oid](JSON.stringify(value));
      expect(sql.options.parsers[oid](wire)).toEqual(value);
    });
  }

  it("also accepts an object without an extra encoding step", () => {
    const value = { amount_cents: 200000, checks: [] };
    const wire = sql.options.serializers[3802](value);
    expect(sql.options.parsers[3802](wire)).toEqual(value);
  });
});
