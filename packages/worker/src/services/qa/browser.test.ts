import assert from "node:assert/strict";
import test from "node:test";
import { dynamicDiscoveryPaths, pathTemplatePattern } from ".";

test("dynamic Wix routes match concrete preview links", () => {
  assert.equal(pathTemplatePattern("/courses/{course-slug}").test("/courses/cyber-security"), true);
  assert.equal(pathTemplatePattern("/courses/[slug]").test("/courses/data-science"), true);
  assert.equal(pathTemplatePattern("/events/:eventId").test("/events/123"), true);
  assert.equal(pathTemplatePattern("/courses/{course-slug}").test("/courses"), false);
});

test("dynamic Wix routes are discovered from their owning list page before the homepage", () => {
  assert.deepEqual(dynamicDiscoveryPaths("/courses/{course-slug}"), ["/courses", "/"]);
  assert.deepEqual(dynamicDiscoveryPaths("/events/[eventId]/tickets"), ["/events", "/"]);
});
