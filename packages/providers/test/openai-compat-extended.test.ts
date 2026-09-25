import { describe, expect, it } from "bun:test";
import { OpenAICompatProvider } from "../src/openai-compat.js";

function makeProvider(): OpenAICompatProvider {
  return new OpenAICompatProvider({
    id: "test",
    name: "Test Provider",
    baseURL: "http://localhost:0/v1",
    apiKey: "test-key",
    defaultModel: "test-model",
  });
}

describe("OpenAICompatProvider model discovery", () => {
  it("returns an empty list when listing models fails", async () => {
    const provider = makeProvider();
    (provider as any).client = {
      models: {
        list: async () => {
          throw new Error("network down");
        },
      },
    };
    expect(await provider.listModels()).toEqual([]);
    expect(await provider.isAvailable()).toBe(false);
  });

  it("maps model ids from a successful list", async () => {
    const provider = makeProvider();
    (provider as any).client = {
      models: { list: async () => ({ data: [{ id: "a" }, { id: "b" }] }) },
    };
    expect(await provider.listModels()).toEqual([
      { id: "a", name: "a" },
      { id: "b", name: "b" },
    ]);
    expect(await provider.isAvailable()).toBe(true);
  });

  it("maps non-streaming chat tool calls", async () => {
    const provider = makeProvider();
    (provider as any).client = {
      chat: {
        completions: {
          create: async () => ({
            model: "test-model",
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  content: null,
                  tool_calls: [
                    { id: "c1", function: { name: "foo", arguments: '{"x":1}' } },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          }),
        },
      },
    };

    const result = await provider.chat([{ role: "user", content: "hi" }]);
    expect(result.tool_calls?.[0].function.name).toBe("foo");
    expect(result.finish_reason).toBe("tool_calls");
    expect(result.usage?.total_tokens).toBe(3);
  });
});
