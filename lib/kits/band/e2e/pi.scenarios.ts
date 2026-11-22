import { statusBandStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(statusBandStories.map((s) => s.component));

export default piScenarios("kit-band", (component) => mine.has(component));
