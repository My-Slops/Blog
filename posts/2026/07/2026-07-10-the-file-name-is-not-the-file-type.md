---
title: "The File Name Is Not the File Type"
date: "2026-07-10"
updated: "2026-07-10"
created_at: "2026-07-10T10:00:00-04:00"
published_at: "2026-07-10T10:00:00-04:00"
scheduled_at: "2026-07-10T10:00:00-04:00"
slug: "the-file-name-is-not-the-file-type"
description: "An uploaded file's extension and request header are claims from an untrusted client, not proof of what the bytes contain or how they can execute."
summary: "Classify uploads from validated content, keep them outside executable paths, and serve them with deliberate content-disposition and type policies."
tags: [security, web development, APIs]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/the-file-name-is-not-the-file-type/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

`report.pdf` is a name chosen by a client. `Content-Type: application/pdf` is another client-supplied claim. Neither establishes that the upload contains a PDF, nor that it is safe to render inline.

This distinction is easy to lose in a tidy upload handler:

```ts
if (!file.name.endsWith('.pdf')) throw new Error('PDF required');
store(file, `/uploads/${file.name}`);
```

The extension check answers almost nothing about the bytes. Storing the original name under a web-served path can also create a second problem: path confusion, content-type sniffing, or an active file served with an executable interpretation.

## Separate identity, validation, and delivery

Treat the original filename as display metadata. Generate a storage key controlled by the server. Validate the actual file structure for the formats you support, impose size and decompression limits, and run malware scanning where the threat model requires it.

```text
display_name: quarterly-report.pdf
storage_key: 01J…/blob
detected_type: application/pdf
delivery: attachment
```

These are deliberately different fields because they answer different questions. A detected media type may be acceptable for one workflow but still inappropriate for inline display. An SVG, for example, can be a valid image format and still carry active content that deserves separate handling.

When serving user-provided files, choose a conservative `Content-Disposition: attachment` unless inline rendering is a reviewed product requirement. Set the intended `Content-Type`; use `X-Content-Type-Options: nosniff` where applicable; and keep the upload origin separate from application cookies if browser execution is in scope.

## Validation has limits

File-signature checks are not a magic security gate. Polyglot files exist, parsers have vulnerabilities, and an apparently valid document can contain a malicious payload for a downstream consumer. The goal is defense in depth: allow only needed formats, validate them with format-aware tooling, isolate processing, and avoid granting an upload more authority merely because it passed a superficial check.

## References

- [RFC 9110, section 8.3](https://www.rfc-editor.org/rfc/rfc9110#section-8.3) defines HTTP media types and representation metadata.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) recommends allowlists, generated filenames, content validation, and storage isolation.

## Final take

A filename is user interface data. A file type is a security decision. Do not let the former quietly make the latter.

## Changelog

- 2026-10-04T19:56:51-04:00: Recovered the 2026-07-10 scheduled slot after evidence confirmed a started run with no completed result or source.
