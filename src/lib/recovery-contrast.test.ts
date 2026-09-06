import {it} from 'vitest';
import {execFileSync} from 'node:child_process';
it('measures recovery text contrast and rejects the former dark-mode colours',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import {contrastRatio as ratio} from './scripts/color-contrast.mjs';
    assert.equal(ratio('rgb(0,0,0)','rgb(255,255,255)'),21);
    for(const bg of ['rgb(59,43,39)','rgb(33,59,51)'])assert(ratio('rgb(239,240,248)',bg)>=4.5);
    assert(ratio('rgb(77,109,98)','rgb(33,59,51)')<4.5);
    for(const bg of ['rgb(91,112,181)','rgb(79,123,114)'])assert(ratio('rgb(255,255,255)',bg)>=4.5);
    assert.throws(()=>ratio('rgba(255,255,255,0.5)','rgb(0,0,0)'));
    const html=fs.readFileSync('mobile-shell/connection-error.html','utf8').split('</style>')[0];
    assert(html.includes(':root[data-theme="dark"] .status, :root[data-theme="dark"] .note { color: var(--text); }'));
    assert(html.includes(':root[data-theme="dark"] .primary { color: #fff; }'));
  `]);
});
