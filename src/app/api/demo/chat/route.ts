import { z } from "zod";
import { demoStepForPrompt } from "../../../../demo/script";
import { streamResponse } from "../../../../server/agent/chat";
import { runScriptedTurn } from "../../../../server/demo/turn";
import { AppError } from "../../../../server/errors";
import { withSession } from "../../../../server/session/http";

const Body = z.object({ message: z.string().max(200) });

/** Scripted demo turns: the real pipeline, no model, no cost. */
export function POST(request: Request) {
  return withSession(request, async ({ db, sessionId }) => {
    const { message } = Body.parse(await request.json());
    const step = demoStepForPrompt(message);
    if (!step?.turn) throw new AppError("not_found", "That isn't one of the demo's questions.");
    return streamResponse(({ emit }) => runScriptedTurn(db, sessionId, step, emit));
  });
}
