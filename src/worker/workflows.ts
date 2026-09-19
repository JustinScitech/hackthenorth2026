import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import type * as activities from "./activities";

export const brokerResponseSignal = defineSignal<[string]>("brokerResponse");
export const reviewDecisionSignal = defineSignal<[string]>("reviewDecision");

const work = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3, initialInterval: "2 seconds", backoffCoefficient: 2 },
});

export async function underwritingCase(caseId: string): Promise<void> {
  const brokerResponses: string[] = [];
  const decisions: string[] = [];
  setHandler(brokerResponseSignal, (actionId) => { brokerResponses.push(actionId); });
  setHandler(reviewDecisionSignal, (actionId) => { decisions.push(actionId); });

  try {
    await work.extractCase(caseId);
    let { needsBroker } = await work.checkCase(caseId);
    let followUps = 0;
    while (needsBroker || brokerResponses.length > 0) {
      if (brokerResponses.length === 0) {
        const responseArrived = await condition(() => brokerResponses.length > 0, "24 hours");
        if (!responseArrived) {
          await work.recordBrokerFollowUp(caseId, ++followUps);
          continue;
        }
      }
      const actionId = brokerResponses.shift()!;
      if (!(await work.recordBrokerResponse(caseId, actionId))) continue;
      await work.extractCase(caseId);
      ({ needsBroker } = await work.checkCase(caseId));
    }
    await condition(() => decisions.length > 0);
    await work.finalizeDecision(caseId, decisions.shift()!);
  } catch (error) {
    await work.failCase(caseId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
