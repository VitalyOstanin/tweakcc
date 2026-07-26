import { describe, expect, it } from 'vitest';

import {
  isValidSlashCommandName,
  writeCompactAndContinue,
  writeCompactAndContinueCommand,
  writeCompactAndContinueShouldQuery,
} from './compactAndContinue';

const compactBranch =
  'if(C.type==="compact"){let R=[b,A,...C.displayText?[zr({content:`<local-command-stdout>${fIe(C.displayText)}</local-command-stdout>`,timestamp:new Date(Date.now()+100).toISOString()})]:[]],H={...C.compactionResult,messagesToKeep:[...C.compactionResult.messagesToKeep,...R]};return{messages:Yze(H),shouldQuery:!1,command:y}}' +
  'if(C.type==="query")return{messages:[A,zr({content:C.prompt,isMeta:!0})],shouldQuery:!0,command:y,resultText:C.value};';

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
  describe('writeCompactAndContinueShouldQuery', () => {
    it('flips shouldQuery to true in the compact result branch', () => {
      const result = writeCompactAndContinueShouldQuery(makeInput());

      expect(result).not.toBeNull();
      expect(result).toContain(
        'return{messages:Yze(H),shouldQuery:!0,command:y}'
      );
    });

    it('leaves the neighbouring query branch untouched', () => {
      const result = writeCompactAndContinueShouldQuery(makeInput());

      expect(result).toContain(
        'if(C.type==="query")return{messages:[A,zr({content:C.prompt,isMeta:!0})],shouldQuery:!0,command:y,resultText:C.value}'
      );
      expect(result).not.toContain('shouldQuery:!1');
    });

    it('is idempotent when already patched', () => {
      const patched = writeCompactAndContinueShouldQuery(makeInput());
      expect(patched).not.toBeNull();

      expect(writeCompactAndContinueShouldQuery(patched!)).toBe(patched);
    });

    it('returns null when the pattern is not found', () => {
      expect(
        writeCompactAndContinueShouldQuery('const x=1;function foo(){}')
      ).toBeNull();
    });
  });

  describe('writeCompactAndContinueCommand', () => {
    it('registers the command under the default name and queues both commands', () => {
      const result = writeCompactAndContinueCommand(makeInput(), 'cc', 'c');

      expect(result).not.toBeNull();
      expect(result).toContain('name:"cc"');
      expect(result).toContain('userFacingName(){return"cc"}');
      expect(result).toContain(
        'IE({agentId:Si(),mode:"prompt",value:"/c",priority:"next"});IE({agentId:Si(),mode:"prompt",value:"/compact",priority:"next"});'
      );
      expect(result).toContain('load:()=>Promise.resolve({call:async()=>{');
    });

    it('honours a custom command name', () => {
      const result = writeCompactAndContinueCommand(makeInput(), 'ca', 'c');

      expect(result).not.toBeNull();
      expect(result).toContain('name:"ca"');
      expect(result).toContain('userFacingName(){return"ca"}');
      expect(result).not.toContain('name:"cc"');
    });

    it('queues only /compact when no preparation command is configured', () => {
      const result = writeCompactAndContinueCommand(makeInput(), 'cc', null);

      expect(result).not.toBeNull();
      expect(result).toContain(
        'IE({agentId:Si(),mode:"prompt",value:"/compact",priority:"next"});'
      );
      expect(result).toContain('value:"Queued /compact"');
      expect(result).not.toContain('value:"/c",');
    });

    it('inserts the definition into the slash command array', () => {
      const result = writeCompactAndContinueCommand(makeInput(), 'cc', 'c');

      expect(result).not.toBeNull();
      expect(result).toContain('...Fa?[Fa]:[],{type:"local",name:"cc"');
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
        expect(
          writeCompactAndContinueCommand(makeInput(), name, 'c')
        ).toBeNull();
      }
    });

    it('rejects an invalid preparation command name', () => {
      expect(
        writeCompactAndContinueCommand(makeInput(), 'cc', 'c";alert(1);"')
      ).toBeNull();
    });

    it('is idempotent when already patched', () => {
      const patched = writeCompactAndContinueCommand(makeInput(), 'cc', 'c');
      expect(patched).not.toBeNull();

      expect(writeCompactAndContinueCommand(patched!, 'cc', 'c')).toBe(patched);
    });

    it('returns null when the command queue API is not found', () => {
      const withoutQueue = `const x=1;${compactBranch}${slashCommandArray};`;

      expect(
        writeCompactAndContinueCommand(withoutQueue, 'cc', 'c')
      ).toBeNull();
    });
  });

  describe('writeCompactAndContinue', () => {
    it('applies both sub-patches', () => {
      const result = writeCompactAndContinue(makeInput(), 'cc', 'c');

      expect(result).not.toBeNull();
      expect(result).toContain(
        'return{messages:Yze(H),shouldQuery:!0,command:y}'
      );
      expect(result).toContain('name:"cc"');
    });

    it('applies only the shouldQuery sub-patch when no command name is set', () => {
      const result = writeCompactAndContinue(makeInput(), null, 'c');

      expect(result).not.toBeNull();
      expect(result).toContain(
        'return{messages:Yze(H),shouldQuery:!0,command:y}'
      );
      expect(result).not.toContain('tweakccCompactAndContinue');
    });

    it('returns null when the compact branch is missing', () => {
      expect(
        writeCompactAndContinue(`const x=1;${queueApi}`, 'cc', 'c')
      ).toBeNull();
    });
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
