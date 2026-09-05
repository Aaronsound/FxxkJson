import { createJsonComparison, type JsonCompareWorkerRequest, type JsonCompareWorkerResponse } from '../utils/jsonDiff';

let comparison: ReturnType<typeof createJsonComparison> | null = null;

self.onmessage = (event: MessageEvent<JsonCompareWorkerRequest>) => {
  let response: JsonCompareWorkerResponse;
  try {
    if ('releaseValues' in event.data) {
      comparison?.releaseValues();
      return;
    }
    if ('leftText' in event.data) comparison = createJsonComparison(event.data.leftText, event.data.rightText);
    if (!comparison) throw new Error('No active comparison. Please compare again.');
    if ('value' in event.data) {
      const { id, path, side, offset, full } = event.data.value;
      response = { id, value: comparison.readValue(path, side, offset, full) };
    } else {
      response = { result: comparison.next() };
    }
  } catch (error) {
    comparison = null;
    response = { error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
