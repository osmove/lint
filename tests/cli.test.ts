import { describe, expect, it } from "vitest";
import { program } from "../src/index.js";

describe("cli", () => {
  it("exposes grouped canonical commands", () => {
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toEqual(
      expect.arrayContaining(["hooks", "setup", "config", "install", "machine", "auth"]),
    );
  });

  it("keeps legacy aliases for backward compatibility", () => {
    const commandNames = program.commands.map((command) => command.name().split(" ")[0]);

    expect(commandNames).toEqual(
      expect.arrayContaining([
        "install:hooks",
        "uninstall:hooks",
        "hooks:status",
        "setup:fix",
        "config:recommend",
        "install:missing",
        "machine:summary",
        "login",
        "logout",
        "signup",
        "whoami",
      ]),
    );
  });

  it("documents grouped subcommands in help output", () => {
    const hooks = program.commands.find((command) => command.name() === "hooks");
    const setup = program.commands.find((command) => command.name() === "setup");
    const config = program.commands.find((command) => command.name() === "config");
    const install = program.commands.find((command) => command.name() === "install");
    const machine = program.commands.find((command) => command.name() === "machine");
    const auth = program.commands.find((command) => command.name() === "auth");

    expect(hooks?.helpInformation()).toContain("install");
    expect(hooks?.helpInformation()).toContain("status");
    expect(hooks?.helpInformation()).toContain("uninstall");

    expect(setup?.helpInformation()).toContain("fix");
    expect(config?.helpInformation()).toContain("recommend");
    expect(install?.helpInformation()).toContain("missing");
    expect(machine?.helpInformation()).toContain("summary");
    expect(auth?.helpInformation()).toContain("login");
    expect(auth?.helpInformation()).toContain("logout");
    expect(auth?.helpInformation()).toContain("signup");
    expect(auth?.helpInformation()).toContain("whoami");
  });

  it("keeps legacy aliases out of the root help output", () => {
    const help = program.helpInformation();

    expect(help).toContain("hooks");
    expect(help).toContain("setup");
    expect(help).toContain("auth");
    expect(help).not.toContain("install:hooks");
    expect(help).not.toContain("setup:fix");
    expect(help).not.toContain("config:recommend");
    expect(help).not.toContain("install:missing");
    expect(help).not.toContain("machine:summary");
    expect(help).not.toContain("login");
    expect(help).not.toContain("logout");
    expect(help).not.toContain("signup");
    expect(help).not.toContain("whoami");
  });
});
