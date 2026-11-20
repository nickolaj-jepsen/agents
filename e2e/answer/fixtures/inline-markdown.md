**Q1. Should the endpoint send one JSON response with a `kind` field, and send redirects as a 200 response body that `page.tsx` acts on?**

- **A.** A 200 response like `{kind: "redirect", location, permanent}`. `page.tsx` calls `permanentRedirect()` (308) or `redirect()`. The redirect is cached per URL like any other result.
- **B.** Django answers with a real 301, and the Next.js fetch reads the `Location` header: **simpler** for *legacy* callers, as [the RFC](https://example.com/rfc) has it.

> **Recommended:** A. The redirect stays inside the cached result, and the legacy `CmsPageModal` can simply ignore that kind.
