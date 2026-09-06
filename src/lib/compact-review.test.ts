import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { approvalSummary, planPersian } from './agent-planner';
describe('compact confirmation safety',()=>{
  it('shows every chosen reminder, channel, recurrence and escalation',()=>{
    const p=planPersian('فردا ساعت 17 گزارش بساز').plan!;
    Object.assign(p,{reminderOffsets:[1440,180,60,15,0],channels:['IN_APP','NATIVE','ALARM','PUSH'],recurrence:'WEEKLY',occurrenceCount:3,escalation:true,repeatCount:2,repeatMinutes:20});
    const summary=approvalSummary(p);
    expect(summary.reminders).toBe('۱ روز قبل، ۳ ساعت قبل، ۱ ساعت قبل، ۱۵ دقیقه قبل، زمان موعد');
    expect(summary.channels).toBe('داخل برنامه، Notification، Alarm گوشی، Push');
    expect(summary.recurrence).toBe('هفتگی، ۳ نوبت');expect(summary.followUp).toBe('۲ هشدار پس از موعد با فاصله ۲۰ دقیقه');
  });
  it('does not crash on an incomplete or invalid date',()=>{const p=planPersian('گزارش بساز').plan!;expect(approvalSummary(p).when).toContain('بدون تاریخ');p.date='invalid';expect(approvalSummary(p).when).toContain('نامعتبر');});
  it('keeps actions outside both scrollable editors',()=>{
    const web=readFileSync('src/components/agent-assistant.tsx','utf8'),mobile=readFileSync('mobile-shell/app.js','utf8');
    expect(web.indexOf('className="agent-actions approval-actions"')).toBeLessThan(web.indexOf('className="approval-editor"'));
    expect(mobile).toContain('root.replaceChildren(operationTitle,compact,actions,details,statusNode)');
  });
  it('fails closed for obscuring Android dialogs, not ordinary Persian task text',()=>{
    execFileSync(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict';import {systemDialog} from './scripts/android-system-ui-check.mjs';
      assert(systemDialog(${JSON.stringify('<hierarchy><node text="Pixel Launcher isn\'t responding" resource-id="android:id/aerr_message"/><node text="Wait" bounds="[20,40][80,100]"/></hierarchy>')}).launcher);
      assert(systemDialog('<hierarchy><node resource-id="android:id/aerr_close" text="همراه"/></hierarchy>').blocked);
      assert(!systemDialog('<hierarchy><node text="خرید کتاب"/></hierarchy>').blocked);
      assert.throws(()=>systemDialog('failed dump'));
    `]);
  });
});
