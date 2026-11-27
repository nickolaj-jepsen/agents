import { describe, expect, it } from "vitest";
import { NEUTRAL, nameFor, parseConfig, readConfig, roleFor, routedModel } from "./config.ts";

describe("the frame's own defaults", () => {
  it("assumes nothing about anyone's account, palette or models", () => {
    expect(NEUTRAL).toEqual({
      roles: { provider: "dim", model: "dim", effort: "thinking", path: "dim" },
      watched: [],
      routed: [],
      names: {},
    });
  });

  it("is what an unset configuration file gives", () => {
    expect(readConfig(undefined)).toEqual({ config: NEUTRAL, problems: [] });
  });
});

describe("a configuration supplied by the host", () => {
  it("takes the roles, the watched providers, the routers and the short names", () => {
    const { config, problems } = readConfig(
      JSON.stringify({
        roles: { effort: "accent", path: "dim" },
        watched: ["anthropic"],
        routed: ["auto/deepseek-v4.1-flash"],
        names: { "deepseek-v4.1-flash": "DS Flash" },
      }),
    );
    expect(problems).toEqual([]);
    expect(roleFor(config, "effort")).toBe("accent");
    expect(config.watched).toEqual(["anthropic"]);
    expect(config.routed).toEqual(["auto/deepseek-v4.1-flash"]);
    expect(nameFor(config, { id: "deepseek-v4.1-flash" }, "DeepSeek V4.1 Flash")).toBe("DS Flash");
  });

  it("uses the catalogue's own name where the host named none", () => {
    const { config } = readConfig(JSON.stringify({ names: { other: "×" } }));
    expect(nameFor(config, { id: "replay" }, "Replay (fixture)")).toBe("Replay (fixture)");
  });
});

describe("the effort chip", () => {
  it("wears pi's own colour for the level unless the host names a role", () => {
    expect(roleFor(readConfig("{}").config, "effort")).toBe("thinking");
    expect(roleFor(readConfig('{"roles":{"effort":"accent"}}').config, "effort")).toBe("accent");
  });

  it("refuses a colour that is neither a role nor thinking", () => {
    const { problems } = parseConfig({ roles: { effort: "bright" } });
    expect(problems[0]?.problem).toContain("thinking");
  });
});

describe("a configuration that does not parse", () => {
  it("is reported, and the neutral value stands in for what it got wrong", () => {
    const { config, problems } = readConfig(
      JSON.stringify({ roles: { effort: "bright" }, watched: ["anthropic", 7], names: { x: "" } }),
    );
    expect(roleFor(config, "effort")).toBe("thinking");
    expect(config.watched).toEqual(["anthropic"]);
    expect(config.names).toEqual({});
    expect(problems.map((p) => p.where)).toEqual(["roles.effort", "watched[1]", "names.x"]);
  });

  it("names a typo in the settings themselves", () => {
    const { config, problems } = parseConfig({ colour: "red" });
    expect(config).toEqual(NEUTRAL);
    expect(problems[0]?.where).toBe("colour");
  });

  it("refuses a router that is not provider/id", () => {
    const { config, problems } = parseConfig({ routed: ["deepseek", "auto/x"] });
    expect(config.routed).toEqual(["auto/x"]);
    expect(problems).toEqual([{ where: "routed", problem: '"deepseek" is not provider/id' }]);
  });

  it("reports a file that is not JSON at all", () => {
    const { config, problems } = readConfig("{ roles: }");
    expect(config).toEqual(NEUTRAL);
    expect(problems[0]?.where).toBe("");
    expect(problems[0]?.problem.startsWith("not JSON:")).toBe(true);
  });
});

describe("a router model's spelling", () => {
  it("splits at the first slash", () => {
    expect(routedModel("auto/deepseek-v4.1-flash")).toEqual({
      provider: "auto",
      id: "deepseek-v4.1-flash",
    });
    expect(routedModel("auto/vendor/model")).toEqual({ provider: "auto", id: "vendor/model" });
  });

  it("is not one without both halves", () => {
    expect(routedModel("auto/")).toBeUndefined();
    expect(routedModel("/x")).toBeUndefined();
    expect(routedModel("auto")).toBeUndefined();
  });
});
