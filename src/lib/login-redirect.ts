// Match the login form's existing destination allowlist; never redirect to input URLs.
export function loginReturnTo(returnTo: string | string[] | undefined): "/" | "/?view=assistant" {
  return returnTo === "assistant" ? "/?view=assistant" : "/";
}
