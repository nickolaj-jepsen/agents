import { fieldsStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(fieldsStories.map((s) => s.component));

export default piScenarios("kit-fields", (component) => mine.has(component));
