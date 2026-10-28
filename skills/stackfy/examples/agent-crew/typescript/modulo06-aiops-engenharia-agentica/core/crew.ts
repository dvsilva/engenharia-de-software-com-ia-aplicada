import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { nexusLlm } from './llm_config.ts';

export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, 'string' | 'integer'>;
  run: (input: Record<string, unknown>) => Promise<string>;
};

export type Agent = {
  role: string;
  goal: string;
  backstory: string;
  tools: Tool[];
};

export type Task = {
  description: string;
  expectedOutput: string;
  agent: Agent;
};

const CONTEXT_SEPARATOR = '\n\n----------\n\n';
const TOOL_RESULT_PROMPT =
  'Analyze the tool result. If requirements are met, provide the Final Answer. Otherwise, call the next tool. Deliver only the answer without meta-commentary.';

const titleOf = (name: string) =>
  name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const schemaOf = (tool: Tool): ChatCompletionTool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: {
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([name, type]) => [
          name,
          { title: titleOf(name), type },
        ])
      ),
      required: Object.keys(tool.parameters),
      type: 'object',
      additionalProperties: false,
    },
    strict: true,
  },
});

const systemPrompt = (agent: Agent) =>
  `You are ${agent.role}. ${agent.backstory}\nYour personal goal is: ${agent.goal}`;

const taskPrompt = (task: Task, context: string[]) => {
  const prompt = `\nCurrent Task: ${task.description}\n\nThis is the expected criteria for your final answer: ${task.expectedOutput}\nyou MUST return the actual complete content as the final answer, not a summary.`;

  if (context.length === 0) return prompt;

  return `${prompt}\n\nThis is the context you're working with:\n${context.join(CONTEXT_SEPARATOR)}`;
};

const parseArguments = (text: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null) return {};

  return Object.fromEntries(Object.entries(parsed));
};

const runCall = async (
  tools: Tool[],
  call: ChatCompletionMessageFunctionToolCall
): Promise<ChatCompletionToolMessageParam> => {
  const tool = tools.find(({ name }) => name === call.function.name);
  const content = tool
    ? await tool.run(parseArguments(call.function.arguments))
    : `Tool '${call.function.name}' not found.`;

  return { role: 'tool', tool_call_id: call.id, content };
};

const converse = async (
  agent: Agent,
  messages: ChatCompletionMessageParam[]
): Promise<string> => {
  const completion = await nexusLlm.client.chat.completions.create({
    model: nexusLlm.model,
    messages,
    temperature: nexusLlm.temperature,
    stream: false,
    stop: ['\nObservation:'],
    tools: agent.tools.map(schemaOf),
  });
  const { message } = completion.choices[0];
  const calls = (message.tool_calls ?? []).filter(
    (call): call is ChatCompletionMessageFunctionToolCall =>
      call.type === 'function'
  );

  if (calls.length === 0) return message.content ?? '';

  const results = await Promise.all(
    calls.map((call) => runCall(agent.tools, call))
  );

  return converse(agent, [
    ...messages,
    { role: 'assistant', tool_calls: calls },
    ...results,
    { role: 'user', content: TOOL_RESULT_PROMPT },
  ]);
};

const perform = async (task: Task, context: string[]) => {
  const output = await converse(task.agent, [
    { role: 'system', content: systemPrompt(task.agent) },
    { role: 'user', content: taskPrompt(task, context) },
  ]);

  console.log(`# Agent: ${task.agent.role}\n## Final Answer:\n${output}\n`);

  return output;
};

export const kickoff = async (tasks: Task[]) => {
  const outputs = await tasks.reduce<Promise<string[]>>(
    async (earlier, task) => {
      const context = await earlier;

      return [...context, await perform(task, context)];
    },
    Promise.resolve([])
  );

  return outputs.at(-1) ?? '';
};
