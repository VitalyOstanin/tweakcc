import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESUME_PROMPT,
  isValidSlashCommandName,
  writeCompactAndContinue,
} from './compactAndContinue';

const compactBranch =
  'if(C.type==="compact"){let R=[b,A];return{messages:Yze(R),shouldQuery:!1,command:y}}';

const queueApi =
  '((Fy=pKg()),(mVe=Fy.subscribe),(IE=Fy.enqueue),(Ilt=Fy.dequeue));' +
  'gxu((e)=>IE({agentId:Si(),mode:"prompt",value:`/${e}`}));';

const cmds = Array.from({ length: 31 }, (_, i) => `c${i}`).join(',');
const slashCommandArray =
  'var Cmd0={type:"local",name:"compact",description:"Free up context"};' +
  `Cmds=memo9(()=>[${cmds},...Fa?[Fa]:[]])`;

const makeInput = () =>
  `const x=1;${compactBranch}${queueApi}${slashCommandArray};`;

describe('compactAndContinue', () => {
  it('queues the preparation command, /compact and the resume command', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c');

    expect(result).not.toBeNull();
    expect(result).toContain('name:"cc"');
    expect(result).toContain('userFacingName(){return"cc"}');
    expect(result).toContain(
      'IE({agentId:Si(),mode:"prompt",value:"/c",priority:"later"});' +
        'IE({agentId:Si(),mode:"prompt",value:"/compact",priority:"later"});' +
        'IE({agentId:Si(),mode:"prompt",value:"/cc-resume",priority:"later"});'
    );
    expect(result).toContain('load:()=>Promise.resolve({call:async()=>{');
  });

  it('queues every item with the "later" priority CC gives queued slash commands', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c');

    expect(result).not.toBeNull();
    expect(result).not.toContain('priority:"next"');
    expect(result!.match(/priority:"later"/g)).toHaveLength(3);
  });

  it('carries the follow-up prompt in a hidden prompt command, not in the queue', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c');

    expect(result).not.toBeNull();
    expect(result).toContain(
      `,{type:"prompt",name:"cc-resume",description:"Resume the work that was interrupted by compaction",isEnabled:()=>!0,isHidden:!0,contentLength:0,source:"builtin",tweakccCompactAndContinueResume:!0,async getPromptForCommand(){return[{type:"text",text:${JSON.stringify(DEFAULT_RESUME_PROMPT)}}]},userFacingName(){return"cc-resume"}}`
    );
    expect(result).not.toContain(
      `value:${JSON.stringify(DEFAULT_RESUME_PROMPT)}`
    );
  });

  it('leaves the stock /compact path untouched', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c');

    expect(result).not.toBeNull();
    expect(result).toContain(
      'if(C.type==="compact"){let R=[b,A];return{messages:Yze(R),shouldQuery:!1,command:y}}'
    );
  });

  it('honours a custom command name', () => {
    const result = writeCompactAndContinue(makeInput(), 'ca', 'c');

    expect(result).not.toBeNull();
    expect(result).toContain('name:"ca"');
    expect(result).toContain('name:"ca-resume"');
    expect(result).toContain('value:"/ca-resume"');
    expect(result).not.toContain('name:"cc"');
  });

  it('queues only /compact and the resume command when no preparation command is set', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', null);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'IE({agentId:Si(),mode:"prompt",value:"/compact",priority:"later"});' +
        'IE({agentId:Si(),mode:"prompt",value:"/cc-resume",priority:"later"});'
    );
    expect(result).not.toContain('value:"/c",');
  });

  it('honours a custom resume prompt and escapes it', () => {
    const prompt = 'resume "now"\\back\nnext line';
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c', prompt);

    expect(result).not.toBeNull();
    expect(result).toContain(`text:${JSON.stringify(prompt)}`);
    expect(result).not.toContain('resume "now"\\back\nnext line');
  });

  it('escapes line separators that would break a JS string literal', () => {
    const prompt = `resume\u2028here\u2029now`;
    const result = writeCompactAndContinue(makeInput(), 'cc', null, prompt);

    expect(result).not.toBeNull();
    expect(result).toContain('resume\\u2028here\\u2029now');
    expect(result).not.toContain('\u2028');
  });

  it('omits the resume command when the prompt is null or blank', () => {
    for (const prompt of [null, '', '   ']) {
      const result = writeCompactAndContinue(makeInput(), 'cc', 'c', prompt);

      expect(result).not.toBeNull();
      expect(result).toContain('value:"/compact"');
      expect(result).toContain('value:"Queued /c, /compact"');
      expect(result).not.toContain('cc-resume');
      expect(result).not.toContain('type:"prompt"');
    }
  });

  it('inserts both definitions into the slash command array', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c');

    expect(result).not.toBeNull();
    expect(result).toContain('...Fa?[Fa]:[],{type:"local",name:"cc"');
    expect(result!.indexOf('name:"cc-resume"')).toBeGreaterThan(
      result!.indexOf('name:"cc"')
    );
  });

  it('does nothing when no command name is configured', () => {
    const input = makeInput();

    expect(writeCompactAndContinue(input, null, 'c')).toBe(input);
  });

  it('rejects a command name that is not a valid slash command name', () => {
    for (const name of [
      'cc"',
      'c c',
      '/cc',
      '',
      'cc);globalThis.x=1;("',
      '-cc',
    ]) {
      expect(writeCompactAndContinue(makeInput(), name, 'c')).toBeNull();
    }
  });

  it('rejects an invalid preparation command name', () => {
    expect(
      writeCompactAndContinue(makeInput(), 'cc', 'c";alert(1);"')
    ).toBeNull();
  });

  it('is idempotent when already patched', () => {
    const patched = writeCompactAndContinue(makeInput(), 'cc', 'c');
    expect(patched).not.toBeNull();

    expect(writeCompactAndContinue(patched!, 'cc', 'c')).toBe(patched);
  });

  it('returns null when the command queue API is not found', () => {
    const withoutQueue = `const x=1;${compactBranch}${slashCommandArray};`;

    expect(writeCompactAndContinue(withoutQueue, 'cc', 'c')).toBeNull();
  });

  describe('isValidSlashCommandName', () => {
    it('accepts names CC itself can parse', () => {
      for (const name of [
        'cc',
        'ca',
        'compact-and-continue',
        'ns:cmd',
        'a_b',
      ]) {
        expect(isValidSlashCommandName(name)).toBe(true);
      }
    });

    it('rejects everything else', () => {
      for (const name of ['', '/cc', 'c c', 'cc"', ':cc', '-cc', 'cc\n']) {
        expect(isValidSlashCommandName(name)).toBe(false);
      }
    });
  });
});
