import { fieldsStories } from "../src/stories.ts";
import { claudeScenarios } from "../../catalog/src/e2e/claude.ts";

const mine = new Set(fieldsStories.map((s) => s.component));

export default claudeScenarios("kit-fields", (component) => mine.has(component));
