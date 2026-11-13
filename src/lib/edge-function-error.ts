/**
 * Extracts the real error message from a Supabase edge function failure.
 * FunctionsHttpError exposes the underlying Response as `context`, so the
 * friendly message returned by the function (e.g. "A customer with this
 * email already exists") is read from the response body instead of the
 * generic "Edge Function returned a non-2xx status code".
 */
export async function getInvokeErrorMessage(fnError: any): Promise<string> {
  const ctx = fnError?.context;

  if (ctx && typeof ctx.clone === "function") {
    try {
      const parsed = await ctx.clone().json();
      if (parsed?.error) return String(parsed.error);
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      // ignore
    }

    try {
      const text = await ctx.clone().text();
      if (text) return text;
    } catch {
      // ignore
    }
  }

  const body = ctx?.body ?? fnError?.body ?? fnError?.details;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error) return String(parsed.error);
    } catch {
      // ignore
    }

    return body;
  }

  if (body && typeof body === "object" && (body as any).error) {
    return String((body as any).error);
  }

  return String(fnError?.message || "Request failed");
}
