import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export function env(name: string, required = true): string {
  const v = process.env[name];
  if (!v && required) throw new Error(`Missing env var ${name}`);
  return v ?? "";
}
