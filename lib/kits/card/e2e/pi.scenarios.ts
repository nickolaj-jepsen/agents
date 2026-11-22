import { cardStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(cardStories.map((s) => s.component));

export default piScenarios("kit-card", (component) => mine.has(component));
