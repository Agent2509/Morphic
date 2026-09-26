import { describe, expect, it } from "bun:test";
import { parseToolCallsFromText, stripToolCallsFromText } from "../src/loop/tool-call-parser.js";

const known = (name: string) => ["read_file", "shell_exec", "edit_file"].includes(name);
const anyKnown = () => true;

describe("parseToolCallsFromText", () => {
  it("recovers a tool call embedded in prose/fenced JSON", () => {
    const content = `I'll inspect the file.

\`\`\`json
{"name": "read_file", "parameters": {"path": "util.js"}}
\`\`\`

Then I'll continue.`;

    const calls = parseToolCallsFromText(content, known);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe("read_file");
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ path: "util.js" });
  });

  it("handles multiple objects and dedups repeats", () => {
    const content = `
{"name":"read_file","parameters":{"path":"a.js"}}
{"name":"read_file","parameters":{"path":"a.js"}}
{"name":"shell_exec","arguments":{"command":"echo hi"}}
`;
    const calls = parseToolCallsFromText(content, known);
    expect(calls.map((c) => c.function.name)).toEqual(["read_file", "shell_exec"]);
  });

  it("ignores JSON that does not name a known tool", () => {
    const content = `{"name":"not_a_tool","parameters":{}}\n{"foo":"bar"}`;
    expect(parseToolCallsFromText(content, known)).toHaveLength(0);
  });

  it("caps the number of recovered calls", () => {
    const content = Array.from({ length: 20 }, (_, i) =>
      `{"name":"shell_exec","parameters":{"command":"echo ${i}"}}`
    ).join("\n");
    expect(parseToolCallsFromText(content, anyKnown, 5)).toHaveLength(5);
  });

  it("returns no calls for plain assistant text", () => {
    expect(parseToolCallsFromText("All done. No tools needed.", known)).toHaveLength(0);
    expect(parseToolCallsFromText("", known)).toHaveLength(0);
  });

  it("strips tool calls from text leaving surrounding prose", () => {
    const content = `I'll create the file now: {"name": "create_file", "arguments": {"path": "test.txt", "content": "hello"}} Done creating file!`;
    const knownTools = (n: string) => n === "create_file";
    expect(stripToolCallsFromText(content, knownTools)).toBe("I'll create the file now:  Done creating file!");
  });

  it("returns empty string when content is only a tool call JSON", () => {
    const content = `{"name": "read_file", "arguments": {"path": "foo.ts"}}`;
    expect(stripToolCallsFromText(content, known)).toBe("");
  });
});
