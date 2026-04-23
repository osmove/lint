import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import * as api from "./api.js";
import { REFS_DIR, TOKEN_PATH, USERNAME_PATH } from "./config.js";
import { ensureDir } from "./utils.js";

export function getUsername(): string | null {
  try {
    return fs.readFileSync(USERNAME_PATH, "utf-8").trim();
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  try {
    return fs.readFileSync(TOKEN_PATH, "utf-8").trim();
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!(getUsername() && getToken());
}

function saveCredentials(username: string, token: string): void {
  ensureDir(REFS_DIR);
  fs.writeFileSync(USERNAME_PATH, username, "utf-8");
  fs.writeFileSync(TOKEN_PATH, token, "utf-8");
}

function clearCredentials(): void {
  try {
    if (fs.existsSync(USERNAME_PATH)) fs.unlinkSync(USERNAME_PATH);
    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
  } catch {
    // Ignore cleanup errors
  }
}

export async function login(username: string, password: string): Promise<boolean> {
  const result = await api.login(username, password);
  if (result.data) {
    saveCredentials(result.data.username, result.data.authentication_token);
    console.log(`Logged in as ${chalk.green(result.data.username)}.`);
    return true;
  }
  console.log(chalk.red("Login failed."), result.error || "Invalid credentials.");
  return false;
}

export async function signup(username: string, email: string, password: string): Promise<boolean> {
  const result = await api.signup(username, email, password);
  if (result.data) {
    saveCredentials(result.data.username, result.data.authentication_token);
    console.log(`Account created. Logged in as ${chalk.green(result.data.username)}.`);
    return true;
  }
  console.log(chalk.red("Signup failed."), result.error || "Unable to create account.");
  return false;
}

export function logout(): void {
  clearCredentials();
  console.log("Logged out.");
}

export async function printStatus(): Promise<void> {
  const username = getUsername();
  const token = getToken();
  if (!username || !token) {
    console.log(`Not logged in. Run ${chalk.cyan("lint auth login")} to sign in.`);
    return;
  }
  const result = await api.fetchUser(username, token);
  if (result.data) {
    console.log(`Logged in as ${chalk.green(username)}.`);
  } else {
    console.log(`Stored as ${chalk.yellow(username)} (unable to verify — API may be offline).`);
  }
}
