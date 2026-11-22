import { noticeLineStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(noticeLineStories.map((s) => s.component));

export default claudeScenarios("kit-notice", (component) => mine.has(component));
