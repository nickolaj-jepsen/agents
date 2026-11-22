import { noticeLineStories } from "../src/stories.ts";
import { piScenarios } from "../../catalog/src/e2e/pi.ts";

const mine = new Set(noticeLineStories.map((s) => s.component));

export default piScenarios("kit-notice", (component) => mine.has(component));
