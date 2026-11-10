import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { db } from "../src/config/database.js";

const args = process.argv.slice(2);
const emailArg = args[0];

if (!emailArg) {
  console.error("Usage: npm run auth:reset -- owner@example.com");
  process.exit(1);
}

const matches = db.prepare(
  "SELECT id, email, full_name, role FROM users WHERE email = ? COLLATE NOCASE"
).all(emailArg.trim());

if (matches.length === 0) {
  console.error("No user found with that email in the configured SQLite database.");
  db.close();
  process.exit(1);
}

if (matches.length > 1) {
  console.error("More than one tenant uses this email. Reset is stopped to avoid changing the wrong account.");
  db.close();
  process.exit(1);
}

const user = matches[0];
if (user.role !== "owner") {
  console.error("Safety check failed: this utility only resets the owner account.");
  db.close();
  process.exit(1);
}

const hiddenOutput = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  }
});
const rl = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true });

function askHidden(prompt) {
  process.stdout.write(prompt);
  return new Promise((resolve) => rl.question("", resolve));
}

try {
  console.log(`Resetting password for ${user.full_name} <${user.email}>.`);
  const password = await askHidden("New password (minimum 10 characters): ");
  process.stdout.write("\n");
  const confirmation = await askHidden("Confirm new password: ");
  process.stdout.write("\n");

  if (password.length < 10) throw new Error("Password must contain at least 10 characters.");
  if (password !== confirmation) throw new Error("Passwords do not match.");

  const salt = randomBytes(16).toString("hex");
  const passwordHash = salt + ":" + scryptSync(password, salt, 64).toString("hex");

  const update = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");
  const revoke = db.prepare("DELETE FROM sessions WHERE user_id = ?");
  db.exec("BEGIN IMMEDIATE");
  try {
    update.run(passwordHash, user.id);
    revoke.run(user.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  console.log("Owner password updated. All existing sessions were signed out.");
} catch (error) {
  console.error(error.message || "Password reset failed.");
  process.exitCode = 1;
} finally {
  rl.close();
  db.close();
}
