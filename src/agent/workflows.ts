import { ContinueAsNew, condition, continueAsNew, defineSignal, proxyActivities, setHandler, workflowInfo } from "@temporalio/workflow";
import type * as activities from "./activities";
import { BROKER_RESPONSE_SIGNAL, REVIEW_DECISION_SIGNAL } from "./contracts";

export const brokerResponseSignal = defineSignal<[string]>(BROKER_RESPONSE_SIGNAL);
export const reviewDecisionSignal = defineSignal<[string]>(REVIEW_DECISION_SIGNAL);

const work = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3, initialInterval: "2 seconds", backoffCoefficient: 2 },
});

type Checkpoint = { phase: "waiting_for_broker" | "review_ready"; followUps: number };

export async function underwritingCase(caseId: string, checkpoint?: Checkpoint): Promise<void> {
  const brokerResponses: string[] = [];
  const decisions: string[] = [];
  setHandler(brokerResponseSignal, (actionId) => { brokerResponses.push(actionId); });
  setHandler(reviewDecisionSignal, (actionId) => { decisions.push(actionId); });

  try {
    let needsBroker = checkpoint?.phase === "waiting_for_broker";
    let followUps = checkpoint?.followUps ?? 0;
    if (!checkpoint) {
      await work.extractCase(caseId);
      await work.researchPublicSource(caseId);
      ({ needsBroker } = await work.checkCase(caseId));
    }
    while (needsBroker || brokerResponses.length > 0) {
      if (workflowInfo().continueAsNewSuggested && brokerResponses.length === 0) {
        await continueAsNew<typeof underwritingCase>(caseId, { phase: "waiting_for_broker", followUps });
      }
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
    if (workflowInfo().continueAsNewSuggested && decisions.length === 0) {
      await continueAsNew<typeof underwritingCase>(caseId, { phase: "review_ready", followUps });
    }
    await condition(() => decisions.length > 0);
    await work.finalizeDecision(caseId, decisions.shift()!);
  } catch (error) {
    if (error instanceof ContinueAsNew) throw error;
    await work.failCase(caseId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
