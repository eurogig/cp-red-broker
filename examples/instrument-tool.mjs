// Target-side integration sketch, not a runnable/verified SDK example.
// Enable LAKERA_RED_TOOL_INTERCEPT and give this target runtime its own Red key.
import {interceptTool} from 'lakera-red-sdk';
export async function tracedTool(sessionId, toolName, toolArguments, invokeSandboxTool) {
  const result = await invokeSandboxTool(toolArguments);
  return await interceptTool({sessionId,toolName,toolArguments:JSON.stringify(toolArguments),result});
}
// Use the returned value as the agent's tool result. sessionId must be the
// authenticated runner request's sessionId, never an ID supplied inside a prompt.
