import { describe, expect, it } from "vitest";
import { program } from "../src/index.js";

describe("cli", () => {
  it("exposes top-level canonical commands and grouped namespaces", () => {
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toEqual(
      expect.arrayContaining([
        // Top-level canonical
        "init",
        "bootstrap",
        "doctor",
        // Grouped namespaces
        "hooks",
        "setup",
        "config",
        "install",
        "machine",
        "auth",
        "format",
        "explain",
      ]),
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
        "explain-run",
        "login",
        "logout",
        "signup",
        "whoami",
        "prettify",
      ]),
    );

    // `setup init`, `setup bootstrap`, `setup doctor` remain hidden legacy aliases
    // under the `setup` group, even though their canonical forms are top-level.
    const setup = program.commands.find((command) => command.name() === "setup");
    const setupSubcommandNames = (setup?.commands ?? []).map((command) =>
      command.name().split(" ")[0],
    );
    expect(setupSubcommandNames).toEqual(
      expect.arrayContaining(["init", "bootstrap", "doctor"]),
    );
  });

  it("documents grouped subcommands in help output", () => {
    const hooks = program.commands.find((command) => command.name() === "hooks");
    const setup = program.commands.find((command) => command.name() === "setup");
    const config = program.commands.find((command) => command.name() === "config");
    const install = program.commands.find((command) => command.name() === "install");
    const machine = program.commands.find((command) => command.name() === "machine");
    const auth = program.commands.find((command) => command.name() === "auth");
    const format = program.commands.find((command) => command.name() === "format");
    const explain = program.commands.find((command) => command.name() === "explain");

    expect(hooks?.helpInformation()).toContain("install");
    expect(hooks?.helpInformation()).toContain("status");
    expect(hooks?.helpInformation()).toContain("uninstall");

    // `setup` only exposes `fix` in its visible help — `init`, `bootstrap`,
    // and `doctor` are hidden legacy aliases under setup but canonical at top-level.
    expect(setup?.helpInformation()).toContain("fix");
    expect(setup?.helpInformation()).not.toContain(" init");
    expect(setup?.helpInformation()).not.toContain(" bootstrap");
    expect(setup?.helpInformation()).not.toContain(" doctor");
    expect(config?.helpInformation()).toContain("recommend");
    expect(install?.helpInformation()).toContain("missing");
    expect(machine?.helpInformation()).toContain("summary");
    expect(auth?.helpInformation()).toContain("status");
    expect(auth?.helpInformation()).toContain("login");
    expect(auth?.helpInformation()).toContain("logout");
    expect(auth?.helpInformation()).toContain("signup");
    expect(auth?.helpInformation()).not.toContain("whoami");
    expect(format?.helpInformation()).toContain("write");
    expect(explain?.helpInformation()).toContain("run");
  });

  it("keeps legacy aliases out of the root help output", () => {
    const help = program.helpInformation();

    expect(help).toContain("hooks");
    expect(help).toContain("setup");
    expect(help).toContain("auth");
    expect(help).toContain("format");
    expect(help).toContain("explain");
    // Top-level canonical commands ARE in root help
    expect(help).toContain("init");
    expect(help).toContain("bootstrap");
    expect(help).toContain("doctor");
    expect(help).not.toContain("pre-commit");
    expect(help).not.toContain("prepare-commit-msg");
    expect(help).not.toContain("post-commit");
    expect(help).not.toContain("install:hooks");
    expect(help).not.toContain("setup:fix");
    expect(help).not.toContain("config:recommend");
    expect(help).not.toContain("install:missing");
    expect(help).not.toContain("machine:summary");
    expect(help).not.toContain("explain-run");
    expect(help).not.toContain("login");
    expect(help).not.toContain("logout");
    expect(help).not.toContain("signup");
    expect(help).not.toContain("whoami");
    expect(help).not.toContain("prettify");
  });
});
