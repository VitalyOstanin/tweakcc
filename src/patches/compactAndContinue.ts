import { debug } from '../utils';
import { showDiff } from './index';
import { writeSlashCommandDefinition } from './slashCommands';

/**
 * Slash command names accepted by CC's parser are matched with
 * /^[a-zA-Z0-9:_-]+/, and the name is injected into a string literal inside the
 * bundle, so anything outside this set is rejected instead of escaped.
 */
export const isValidSlashCommandName = (name: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(name);

const MARKER = 'tweakccCompactAndContinue';

/**
 * Sub-patch 1: run a query after a manual /compact.
 *
 * The REPL branch handling a `compact` command result returns
 * `shouldQuery:!1`, so CC waits for input after compacting even though the
 * summary already carries the "continue without asking further questions"
 * instruction. Flipping it to `!0` makes CC resume on its own.
 */
export const writeCompactAndContinueShouldQuery = (
  oldFile: string
): string | null => {
  const alreadyPatched =
    /if\([$\w]+\.type==="compact"\)\{[\s\S]{0,600}?return\{messages:[$\w]+\([$\w]+\),shouldQuery:!0,command:[$\w]+\}\}/;
  if (alreadyPatched.test(oldFile)) return oldFile;

  const pattern =
    /if\([$\w]+\.type==="compact"\)\{[\s\S]{0,600}?return\{messages:[$\w]+\([$\w]+\),shouldQuery:!1,command:[$\w]+\}\}/;
  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    debug(
      'patch: compactAndContinue: failed to find the compact command result branch'
    );
    return null;
  }

  const original = match[0];
  const flagIndex = original.lastIndexOf('shouldQuery:!1');
  if (flagIndex === -1) {
    debug(
      'patch: compactAndContinue: failed to locate shouldQuery in the compact branch'
    );
    return null;
  }

  const replacement =
    original.slice(0, flagIndex) +
    'shouldQuery:!0' +
    original.slice(flagIndex + 'shouldQuery:!1'.length);

  const startIndex = match.index;
  const endIndex = startIndex + original.length;
  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);
  return newFile;
};

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
 * Sub-patch 2: add a macro slash command that queues the preparation command
 * (when configured) and then /compact. Queued items only run once the current
 * turn finishes, so the preparation command gets a full model turn before the
 * conversation is compacted; sub-patch 1 then resumes work automatically.
 */
export const writeCompactAndContinueCommand = (
  oldFile: string,
  commandName: string,
  prepareCommand: string | null
): string | null => {
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

  if (oldFile.includes(`${MARKER}:!0`)) return oldFile;

  const api = findQueueApi(oldFile);
  if (!api) return null;

  const { enqueue, agentId } = api;
  const queued = prepareCommand ? [prepareCommand, 'compact'] : ['compact'];
  const enqueueCalls = queued
    .map(
      name =>
        `${enqueue}({agentId:${agentId}(),mode:"prompt",value:"/${name}",priority:"next"});`
    )
    .join('');
  const queuedList = queued.map(name => `/${name}`).join(', ');

  const commandDef = `,{type:"local",name:"${commandName}",description:"Compact the conversation and keep working without further input",isEnabled:()=>!0,isHidden:!1,${MARKER}:!0,load:()=>Promise.resolve({call:async()=>{if(typeof ${enqueue}!=="function"||typeof ${agentId}!=="function")return{type:"text",value:"tweakcc: command queue is unavailable"};${enqueueCalls}return{type:"text",value:"Queued ${queuedList}"}}}),userFacingName(){return"${commandName}"}}`;

  return writeSlashCommandDefinition(oldFile, commandDef);
};

/**
 * Apply both sub-patches. Sub-patch 2 is skipped when no command name is
 * configured; sub-patch 1 is useful on its own.
 */
export const writeCompactAndContinue = (
  oldFile: string,
  commandName: string | null,
  prepareCommand: string | null
): string | null => {
  const withShouldQuery = writeCompactAndContinueShouldQuery(oldFile);
  if (withShouldQuery === null) return null;

  if (commandName === null) return withShouldQuery;

  return writeCompactAndContinueCommand(
    withShouldQuery,
    commandName,
    prepareCommand
  );
};
