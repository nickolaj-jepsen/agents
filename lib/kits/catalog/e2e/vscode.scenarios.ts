import { vscodeKitScenarios } from "../src/e2e/vscode.ts";

// The design foundation's graphical stories (type roles, a panel, icons, row rhythm): they are
// the catalogue's own, since no component owns them.
export default vscodeKitScenarios("kit-catalog", (component) => component === "foundation");
