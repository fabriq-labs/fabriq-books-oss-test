export type PasswordPolicyFailure = "length" | "digit" | "special";

export const PASSWORD_POLICY_RULES: { id: PasswordPolicyFailure; label: string }[] = [
  { id: "length", label: "At least 8 characters" },
  { id: "digit", label: "A number" },
  { id: "special", label: "A symbol" },
];

/** New password policy (keep in sync with backend change-password). */
export function getNewPasswordPolicyFailures(pw: string): PasswordPolicyFailure[] {
  const failures: PasswordPolicyFailure[] = [];
  if (pw.length < 8) failures.push("length");
  if (!/[0-9]/.test(pw)) failures.push("digit");
  if (!/[^A-Za-z0-9]/.test(pw)) failures.push("special");
  return failures;
}

function joinElegant(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** One readable sentence listing only what still needs to change. */
export function formatPasswordPolicyMessage(failures: PasswordPolicyFailure[]): string {
  const has = (f: PasswordPolicyFailure) => failures.includes(f);
  const len = has("length");
  const dig = has("digit");
  const spec = has("special");

  if (len && dig && spec) {
    return "Your new password must be at least 8 characters long, and include a number and a symbol.";
  }
  if (dig && spec && !len) {
    return "Your password must include a number and a symbol.";
  }

  const phrases: Record<PasswordPolicyFailure, string> = {
    length: "be at least 8 characters long",
    digit: "include a number",
    special: "include a symbol",
  };
  const parts = failures.map((f) => phrases[f]);
  return `Your password must ${joinElegant(parts)}.`;
}
