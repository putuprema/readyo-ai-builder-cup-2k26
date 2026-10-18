import type { JsonModel, JsonRequest, JsonResult } from "../gemini/client.js";

// An in-memory model for the pricing tests: answers with a canned JSON (or throws), and
// records the requests it received so tests can check the prompt and the schema.

export class FakeModel implements JsonModel {
  readonly requests: JsonRequest[] = [];

  constructor(private readonly answer: () => JsonResult | Promise<JsonResult>) {}

  static returning(
    json: unknown,
    grounding: JsonResult["grounding"] = { queries: [], sources: [] },
  ) {
    return new FakeModel(() => ({ json, grounding }));
  }

  static throwing(error: unknown) {
    return new FakeModel(() => {
      throw error;
    });
  }

  async generateJson(request: JsonRequest): Promise<JsonResult> {
    this.requests.push(request);
    return this.answer();
  }
}
