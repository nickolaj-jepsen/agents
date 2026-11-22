import { imageStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(imageStories.map((s) => s.component));

export default piScenarios("kit-image", (component) => mine.has(component));
