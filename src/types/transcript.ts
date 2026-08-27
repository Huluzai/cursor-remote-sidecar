export type TranscriptLineKind =
  | "user"
  | "assistant"
  | "thinking"
  | "tool"
  | "system";

export interface TranscriptLine {
  kind: TranscriptLineKind;
  text: string;
  detail?: string;
  /** Stable id per user-message turn boundary (Path C extension). */
  turnId?: string;
}
