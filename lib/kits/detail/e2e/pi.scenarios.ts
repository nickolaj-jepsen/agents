import { detailStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(detailStories.map((s) => s.component));

export default piScenarios("kit-detail", (component) => mine.has(component));
