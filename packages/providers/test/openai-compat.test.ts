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

describe("OpenAICompatProvider", () => {
  it("returns an empty result when choices is empty", async () => {
    const provider = makeProvider();
    (provider as any).client = {
      chat: {
        completions: {
          create: async () => ({ choices: [], model: "test-model" }),
        },
      },
    };

    const result = await provider.chat([{ role: "user", content: "hi" }]);
    expect(result.content).toBe("");
    expect(result.tool_calls).toBeUndefined();
  });

  it("does not duplicate streamed tool-call names", async () => {
    const provider = makeProvider();

    async function* stream() {
      yield {
        model: "test-model",
        choices: [
          {
            finish_reason: null,
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", function: { name: "foo", arguments: '{"a":' } },
              ],
            },
          },
        ],
      };
      yield {
        choices: [
          {
            finish_reason: "tool_calls",
            delta: {
              tool_calls: [
                { index: 0, function: { name: "oo", arguments: "1}" } },
              ],
            },
          },
        ],
      };
    }

    (provider as any).client = {
      chat: {
        completions: {
          create: async () => stream(),
        },
      },
    };

    const result = await provider.chatStream([{ role: "user", content: "hi" }]);
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls?.[0].function.name).toBe("foo");
    expect(result.tool_calls?.[0].function.arguments).toBe('{"a":1}');
  });

  it("keeps parallel tool calls when index is omitted", async () => {
    const provider = makeProvider();
    async function* stream() {
      yield {
        choices: [
          {
            finish_reason: "tool_calls",
            delta: {
              tool_calls: [
                { id: "c1", function: { name: "one", arguments: "{}" } },
                { id: "c2", function: { name: "two", arguments: "{}" } },
              ],
            },
          },
        ],
      };
    }
    (provider as any).client = { chat: { completions: { create: async () => stream() } } };

    const result = await provider.chatStream([{ role: "user", content: "hi" }]);
    expect(result.tool_calls?.map((c) => c.function.name)).toEqual(["one", "two"]);
  });

  it("handles providers that resend the full argument string", async () => {
    const provider = makeProvider();
    async function* stream() {
      yield { choices: [{ finish_reason: null, delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "f", arguments: '{"a":' } }] } }] };
      yield { choices: [{ finish_reason: "tool_calls", delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] } }] };
    }
    (provider as any).client = { chat: { completions: { create: async () => stream() } } };

    const result = await provider.chatStream([{ role: "user", content: "hi" }]);
    expect(result.tool_calls?.[0].function.arguments).toBe('{"a":1}');
  });

  it("captures streamed usage when provided", async () => {
    const provider = makeProvider();
    async function* stream() {
      yield { choices: [{ finish_reason: null, delta: { content: "hi" } }] };
      yield { choices: [], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } };
    }
    (provider as any).client = { chat: { completions: { create: async () => stream() } } };

    const result = await provider.chatStream([{ role: "user", content: "hi" }]);
    expect(result.usage?.total_tokens).toBe(3);
    expect(result.content).toBe("hi");
  });
});
