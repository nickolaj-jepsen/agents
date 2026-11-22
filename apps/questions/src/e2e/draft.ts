import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Populate a draft while the turn is running, just before it asks. */
export default function (pi: ExtensionAPI) {
  pi.on("tool_execution_start", (event, ctx) => {
    if (event.toolName === "ask_user_question") ctx.ui.setEditorText("Composer draft");
  });
}
