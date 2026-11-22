import { sheetStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(sheetStories.map((s) => s.component));

export default piScenarios("kit-sheet", (component) => mine.has(component));
