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
  it('registers the command under the default name and queues prepare, compact, resume', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c');

    expect(result).not.toBeNull();
    expect(result).toContain('name:"cc"');
    expect(result).toContain('userFacingName(){return"cc"}');
    expect(result).toContain(
      'IE({agentId:Si(),mode:"prompt",value:"/c",priority:"next"});IE({agentId:Si(),mode:"prompt",value:"/compact",priority:"next"});'
    );
    expect(result).toContain(JSON.stringify(DEFAULT_RESUME_PROMPT));
    expect(result).toContain('load:()=>Promise.resolve({call:async()=>{');
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
    expect(result).toContain('userFacingName(){return"ca"}');
    expect(result).not.toContain('name:"cc"');
  });

  it('queues only /compact and the resume prompt when no preparation command is set', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', null);

    expect(result).not.toBeNull();
    expect(result).toContain(
      'IE({agentId:Si(),mode:"prompt",value:"/compact",priority:"next"});'
    );
    expect(result).not.toContain('value:"/c",');
    expect(result).toContain(JSON.stringify(DEFAULT_RESUME_PROMPT));
  });

  it('honours a custom resume prompt and escapes it', () => {
    const prompt = 'resume "now"\\back\nnext line';
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c', prompt);

    expect(result).not.toBeNull();
    expect(result).toContain(JSON.stringify(prompt));
    expect(result).not.toContain('resume "now"\\back\nnext line');
  });

  it('escapes line separators that would break a JS string literal', () => {
    const prompt = `resume\u2028here\u2029now`;
    const result = writeCompactAndContinue(makeInput(), 'cc', null, prompt);

    expect(result).not.toBeNull();
    expect(result).toContain('resume\\u2028here\\u2029now');
    expect(result).not.toContain('\u2028');
  });

  it('omits the resume prompt when it is null or blank', () => {
    for (const prompt of [null, '', '   ']) {
      const result = writeCompactAndContinue(makeInput(), 'cc', 'c', prompt);

      expect(result).not.toBeNull();
      expect(result).toContain('value:"/compact"');
      expect(result).toContain('value:"Queued /c, /compact"');
      expect(result).not.toContain('Continue the conversation');
    }
  });

  it('inserts the definition into the slash command array', () => {
    const result = writeCompactAndContinue(makeInput(), 'cc', 'c');

    expect(result).not.toBeNull();
    expect(result).toContain('...Fa?[Fa]:[],{type:"local",name:"cc"');
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
