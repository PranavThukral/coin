import { describe, expect, it } from "vitest";
import { extractRequestEntities } from "./extract";

describe("action intent phrasing", () => {
  it.each([
    "Never mind the card, pay my hydro bill",
    "Pay my internet bill so the service doesn't stop",
    "Don't forget to pay my hydro bill",
    "Pay my hydro bill without fail",
  ])("recognizes an affirmative request: %s", (text) => {
    expect(extractRequestEntities(text).has_action_intent).toBe(true);
  });

  it.each([
    "Don't pay my hydro bill",
    "Do not send Alex $50",
    "Never send Alex $50",
    "Stop the transfer",
    "Cancel that transfer",
    "How do I send Alex $50?",
    "How can I move $2,000 to my TFSA?",
  ])("does not authorize: %s", (text) => {
    expect(extractRequestEntities(text).has_action_intent).toBe(false);
  });
});
