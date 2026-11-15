import { describe, expect, it } from "vitest";
import { SEED_CONTACTS } from "../../contracts";
import { repairProposalArguments } from "./proposal-tool";

const contacts = SEED_CONTACTS.map((c) => ({ ...c }));
const send = (name: string, email: string | null = null) => ({
  type: "etransfer",
  from_account_id: "acc_chequing",
  contact_id: null,
  new_recipient_name: name,
  new_recipient_email: email,
  amount_cad: 40,
  memo: null,
  rationale: "",
});

describe("repairProposalArguments: saved contacts proposed as new recipients", () => {
  it("maps a first name (or full name) to the one saved contact who has it", () => {
    expect(repairProposalArguments(send("Sam"), contacts)).toMatchObject({ contact_id: "ct_sam", new_recipient_name: null });
    expect(repairProposalArguments(send("sam lee"), contacts)).toMatchObject({ contact_id: "ct_sam" });
  });

  it("leaves genuinely new people alone", () => {
    expect(repairProposalArguments(send("Alex"), contacts)).toMatchObject({ contact_id: null, new_recipient_name: "Alex" });
    // Same first name, different person.
    expect(repairProposalArguments(send("Sam Smith"), contacts)).toMatchObject({ contact_id: null });
    // A typed email means the user meant someone new.
    expect(repairProposalArguments(send("Sam", "sam@elsewhere.example"), contacts)).toMatchObject({ contact_id: null });
  });

  it("does nothing without a contact list, or for other action types", () => {
    expect(repairProposalArguments(send("Sam"))).toMatchObject({ contact_id: null });
    const transfer = { type: "transfer", from_account_id: "acc_hisa", to_account_id: "acc_chequing", amount_cad: 1, rationale: "" };
    expect(repairProposalArguments(transfer, contacts)).toEqual(transfer);
  });
});
