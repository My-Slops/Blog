---
title: "A Screenshot Cannot Test the Interaction That Produced It"
date: "2026-07-16"
updated: "2026-07-16"
created_at: "2026-07-16T10:00:00-04:00"
published_at: "2026-07-16T10:00:00-04:00"
scheduled_at: "2026-07-16T10:00:00-04:00"
slug: "a-screenshot-cannot-test-the-interaction-that-produced-it"
description: "Visual regression tests catch presentation changes, but a matching screenshot cannot prove that focus, keyboard input, or state transitions work."
summary: "Use screenshots for visual assertions and browser interaction tests for behavior. A static image cannot validate the path a user took to reach it."
tags: [testing, frontend, accessibility]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/a-screenshot-cannot-test-the-interaction-that-produced-it/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

A modal can look perfect in a screenshot while being impossible to close with Escape, leaving keyboard focus behind the overlay, or submitting a form twice when a slow network response arrives.

That is not a criticism of visual regression testing. It is a reminder to ask the image the question it can answer. A screenshot compares pixels at one settled state. It does not prove how that state was reached or whether the next user action is valid.

## Pair assertions with the risk

For a design-system change, a screenshot is excellent evidence that spacing, colors, and responsive layout did not drift. For a checkout flow, add a behavioral test that exercises the transition and asserts the observable result.

```ts
await page.getByRole('button', { name: 'Edit billing address' }).click();
await expect(page.getByRole('dialog')).toBeVisible();
await page.keyboard.press('Escape');
await expect(page.getByRole('dialog')).toBeHidden();
await expect(page.getByRole('button', { name: 'Edit billing address' })).toBeFocused();
```

This test has no visual assertion. It verifies the keyboard contract: open, close, and return focus. A screenshot of the open dialog would not reveal any of those facts.

The distinction matters beyond accessibility. A cached fixture can produce the right visual state even when an API request used the wrong authorization header. A test that starts from a preloaded URL can hide a broken navigation transition. A hydration race can disappear by the time a screenshot is captured.

## Keep visual tests narrow

Screenshot tests become noisy when they absorb dynamic clocks, random content, remote ads, or loading animations. Stabilize known nondeterminism, scope the capture to the component under review, and use an intentionally reviewed baseline. Do not respond to visual flakiness by removing browser behavior tests; they are testing different failure modes.

## References

- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) describes screenshot-based regression testing and its baseline model.
- [WAI-ARIA Authoring Practices: Dialog modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) specifies keyboard and focus behavior that pixels cannot show.

## Final take

An image is evidence of appearance, not interaction. Test both when both matter.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-07-16 scheduled slot after archive comparison and primary-source review.
