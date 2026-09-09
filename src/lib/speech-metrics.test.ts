import {describe,it,expect} from 'vitest';
import {speechErrors,normalizePersianTranscript} from '../../scripts/speech-metrics.mjs';
describe('honest Persian ASR scoring',()=>{
 it('normalizes script/punctuation consistently on both sides',()=>expect(normalizePersianTranscript('علي، ساعت ۵؛ مي‌روم')).toBe('علی ساعت 5 می روم'));
 it('counts actual word substitutions and omissions',()=>expect(speechErrors('فردا با علی جلسه دارم','فردا با رضا جلسه')).toMatchObject({words:5,wordErrors:2}));
 it('does not forgive wrong times',()=>expect(speechErrors('ساعت ۱۷','ساعت ۷').wordErrors).toBe(1));
});
