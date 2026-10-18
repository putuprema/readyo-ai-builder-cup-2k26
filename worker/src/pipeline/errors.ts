/**
 * A failure the run cannot recover from and the user can act on: the message is stored as
 * `RunStatus.error` and shown on the progress view. Anything else that throws is an unexpected
 * error, retried by Cloud Tasks (see runner.ts).
 */
export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineError";
  }
}

export const GENERIC_FAILURE_MESSAGE =
  "Something went wrong while analysing your statements. Please try again in a few minutes.";
