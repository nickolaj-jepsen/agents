// The `@agents/drive#tui-test` task: puts the pinned tui-test daemon where `tuiTestBin()` looks.
import { fetchTuiTest } from "./lib/tui-test-release.ts";

console.log(`tui-test: ${await fetchTuiTest()}`);
