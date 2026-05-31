import type { Node } from 'jsonc-parser';

export function getLocateCandidateOffsets(text: string, offset: number): number[];

export function getResolvedNodes(
  cached:
    | {
        formattedText?: string;
        formattedTree?: Node;
        rawTree?: Node;
      }
    | null
    | undefined,
  offset: number
): { leftNode: Node; path: Array<string | number>; rightNode: Node } | null;

export function createJsonWorkerLocateOperations(args: {
  ensureStructureTrees: (tabId: string, cached: unknown) => boolean;
  getDirectValueTree: (tabId: string, requestId: number, text: string) => Node | undefined;
  latestLocateRequestByTab: Map<string, number>;
  structureCache: Map<string, unknown>;
  viewerCache: Map<string, unknown>;
}): {
  handleLocateMessage(message: { offset: number; requestId: number; tabId: string }): void;
  handleLocateRightDirectMessage(message: { offset: number; requestId: number; tabId: string }): void;
  isLatestLocateRequest(tabId: string, requestId: number): boolean;
};
