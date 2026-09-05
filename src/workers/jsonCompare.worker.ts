import { createJsonComparison, type JsonCompareWorkerRequest, type JsonCompareWorkerResponse } from '../utils/jsonDiff';

let comparison: ReturnType<typeof createJsonComparison> | null = null;

self.onmessage = (event: MessageEvent<JsonCompareWorkerRequest>) => {
  let response: JsonCompareWorkerResponse;
  try {
    if ('leftText' in event.data) comparison = createJsonComparison(event.data.leftText, event.data.rightText);
    if (!comparison) throw new Error('No active comparison. Please compare again.');
    const result = comparison.next();
    response = { result };
    if (!result.truncated) comparison = null;
  } catch (error) {
    comparison = null;
    response = { error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
