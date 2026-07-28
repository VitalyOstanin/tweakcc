import { debug } from '../utils';
import { writeSlashCommandDefinition } from './slashCommands';

/**
 * Slash command names accepted by CC's parser are matched with
 * /^[a-zA-Z0-9:_-]+/, and the name is injected into a string literal inside the
 * bundle, so anything outside this set is rejected instead of escaped.
 */
export const isValidSlashCommandName = (name: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(name);

/** Quote a config-provided string for injection into the minified bundle. */
const toJsStringLiteral = (value: string): string =>
  JSON.stringify(value).replace(/[\u2028\u2029]/g, ch =>
    ch === '\u2028' ? '\\u2028' : '\\u2029'
  );

const MARKER = 'tweakccCompactAndContinue';

/** Name of the hidden command that carries the follow-up prompt. */
export const DEFAULT_RESUME_COMMAND_NAME = 'compact-resume';

/**
 * Default follow-up prompt, matching the wording CC itself appends to an
 * auto-compact summary.
 */
export const DEFAULT_RESUME_PROMPT =
  'Continue the conversation from where it left off without asking the user any further questions. Resume directly — do not acknowledge the summary, do not recap what was happening, do not preface with "I\'ll continue" or similar. Pick up the last task as if the break never happened.';

/**
 * Find the minified names of the command-queue `enqueue` function and of the
 * current-agent id getter. Both are top-level bundle variables, so a slash
 * command definition injected elsewhere in the bundle can call them.
 */
const findQueueApi = (
  fileContents: string
): { enqueue: string; agentId: string } | null => {
  const enqueueMatch = fileContents.match(
    /[,;({]([$\w]+)=[$\w]+\.enqueue[,;)}]/
  );
  if (!enqueueMatch) {
    debug('patch: compactAndContinue: failed to find the enqueue assignment');
    return null;
  }
  const enqueue = enqueueMatch[1];

  const agentIdMatch = fileContents.match(
    new RegExp(`${enqueue}\\(\\{agentId:([$\\w]+)\\(\\)`)
  );
  if (!agentIdMatch) {
    debug('patch: compactAndContinue: failed to find the agent id getter');
    return null;
  }

  return { enqueue, agentId: agentIdMatch[1] };
};

/**
 * Add a macro slash command that queues an optional preparation command,
 * then /compact, then a hidden command carrying the follow-up prompt.
 *
 * Every queued item is a slash command, and each is queued with the "later"
 * priority CC itself assigns to queued slash commands. Plain text queued this
 * way is instead delivered into the turn that is already running, which is what
 * would otherwise swallow the follow-up prompt before compaction even starts.
 *
 * /compact keeps its stock behaviour: nothing in the compaction path is
 * modified.
 */
export const writeCompactAndContinue = (
  oldFile: string,
  commandName: string | null,
  prepareCommand: string | null,
  resumePrompt: string | null = DEFAULT_RESUME_PROMPT,
  resumeCommandName: string = DEFAULT_RESUME_COMMAND_NAME
): string | null => {
  if (commandName === null) return oldFile;

  if (!isValidSlashCommandName(commandName)) {
    debug(
      `patch: compactAndContinue: invalid command name "${commandName}", expected /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/`
    );
    return null;
  }
  if (prepareCommand !== null && !isValidSlashCommandName(prepareCommand)) {
    debug(
      `patch: compactAndContinue: invalid preparation command name "${prepareCommand}", expected /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/`
    );
    return null;
  }

  const withResume = resumePrompt !== null && resumePrompt.trim() !== '';
  if (withResume && !isValidSlashCommandName(resumeCommandName)) {
    debug(
      `patch: compactAndContinue: invalid resume command name "${resumeCommandName}", expected /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/`
    );
    return null;
  }

  if (oldFile.includes(`${MARKER}:!0`)) return oldFile;

  const api = findQueueApi(oldFile);
  if (!api) return null;

  const { enqueue, agentId } = api;
  const queuedNames = prepareCommand
    ? [prepareCommand, 'compact']
    : ['compact'];
  if (withResume) queuedNames.push(resumeCommandName);

  const enqueueCalls = queuedNames
    .map(
      name =>
        `${enqueue}({agentId:${agentId}(),mode:"prompt",value:${toJsStringLiteral(`/${name}`)},priority:"later"});`
    )
    .join('');
  const displayText = `Queued ${queuedNames.map(name => `/${name}`).join(', ')}`;

  const macroDef = `,{type:"local",name:"${commandName}",description:"Compact the conversation and keep working without further input",isEnabled:()=>!0,isHidden:!1,${MARKER}:!0,load:()=>Promise.resolve({call:async()=>{if(typeof ${enqueue}!=="function"||typeof ${agentId}!=="function")return{type:"text",value:"tweakcc: command queue is unavailable"};${enqueueCalls}return{type:"text",value:${toJsStringLiteral(displayText)}}}}),userFacingName(){return"${commandName}"}}`;

  const resumeDef = withResume
    ? `,{type:"prompt",name:"${resumeCommandName}",description:"Resume the work that was interrupted by compaction",isEnabled:()=>!0,isHidden:!0,contentLength:0,source:"builtin",${MARKER}Resume:!0,async getPromptForCommand(){return[{type:"text",text:${toJsStringLiteral(resumePrompt as string)}}]},userFacingName(){return"${resumeCommandName}"}}`
    : '';

  return writeSlashCommandDefinition(oldFile, `${macroDef}${resumeDef}`);
};
