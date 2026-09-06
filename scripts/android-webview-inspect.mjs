import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { waitUntil } from "./qa-wait-until.mjs";
import { verifyBarAppearance } from "./android-bar-appearance.mjs";
import { contrastRatio } from "./color-contrast.mjs";

const packageName = process.argv[2];
const outputPath = resolve(process.argv[3] || "artifacts/android/webview.json");
const requiredText = process.argv[4] || "همراه";
const action = process.argv[5] || "";

if (!packageName) throw new Error("Android package name is required.");

const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" }).trim();
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function inspect() {
  const pid = adb("shell", "pidof", packageName).replace(/\r/g, "").split(/\s+/)[0];
  if (!pid) throw new Error(`No running process found for ${packageName}`);

  // A fresh CI emulator has no previous forward yet. Removing a missing
  // listener returns exit code 1, which is harmless and must not fail QA.
  try {
    adb("forward", "--remove", "tcp:9222");
  } catch {}
  adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);

  let targets = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      targets = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json());
      if (targets.some((target) => target.webSocketDebuggerUrl)) break;
    } catch {}
    await delay(1_000);
  }

  const target = targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl) || targets.find((entry) => entry.webSocketDebuggerUrl);
  if (!target) throw new Error("No debuggable Android WebView target was found.");
  process.stdout.write(`WebView target: ${target.title || "(untitled)"} ${target.url || "(no URL)"}\n`);

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  const snapshotExpression = `JSON.stringify({title:document.title,url:location.href,text:document.body?document.body.innerText:"",direction:document.documentElement.dir})`;
  let requestId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    resolver(message);
  });
  const evaluate = (expression = snapshotExpression) => new Promise((resolveResponse, rejectResponse) => {
    requestId += 1;
    const currentId = requestId;
    const timeout = setTimeout(() => {
      pending.delete(currentId);
      rejectResponse(new Error("WebView evaluation timed out."));
    }, 15_000);
    pending.set(currentId, (message) => {
      clearTimeout(timeout);
      resolveResponse(message);
    });
    socket.send(JSON.stringify({ id: currentId, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
  });

  let lastCandidate = null;
  const waitForText = async (text) => {
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const response = await evaluate();
      const serialized = response?.result?.result?.value;
      if (serialized) {
        const candidate = JSON.parse(serialized);
        lastCandidate = candidate;
        if (candidate.text?.trim() && candidate.text.includes(text)) return candidate;
        if (attempt === 0 || attempt % 10 === 9) {
          process.stdout.write(`Rendered candidate ${attempt + 1}: ${JSON.stringify({
            title: candidate.title,
            url: candidate.url,
            direction: candidate.direction,
            text: candidate.text?.slice(0, 300),
          })}\n`);
        }
      }
      await delay(1_000);
    }
    return null;
  };

  if (action === "open-offline") {
    const recovery = await waitForText("اتصال برقرار نشد");
    if (!recovery) throw new Error("The Persian recovery page was not ready for offline fallback.");
    const actionResponse = await evaluate(`(() => {
      const button = document.querySelector("#offline");
      if (!button) throw new Error("Offline recovery button was not found.");
      button.click();
      return { clicked: true, bridge: typeof window.HamrahRecovery, url: location.href };
    })()`);
    if (actionResponse?.result?.exceptionDetails) {
      throw new Error(`Clicking the offline recovery button failed: ${JSON.stringify(actionResponse.result.exceptionDetails)}`);
    }
    process.stdout.write(`Offline action: ${JSON.stringify(actionResponse?.result?.result?.value)}\n`);
    await delay(1_500);
  }

  const result = await waitForText(requiredText);
  if(result && /^(appearance|assert)-(light|dark)$/.test(action)) {
    const theme=action.split('-')[1];
    const check=await evaluate(`(async()=>{
      ${action.startsWith('appearance-')?`document.querySelector('[data-panel="settings"]').click();document.querySelector('[data-appearance="${theme}"]').click();`:''}
      await new Promise(r=>setTimeout(r,500));
      const current=document.documentElement.dataset.theme;
      const bg=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if(current!=='${theme}'||bg!=='${theme==='dark'?'#13151f':'#f7f7ff'}')throw new Error('Explicit appearance mismatch');
      return {theme:current,bg,native:window.__hamrahNativeTheme,systemDark:matchMedia('(prefers-color-scheme:dark)').matches};
    })()`);
    if(check.result.exceptionDetails)throw new Error(JSON.stringify(check.result.exceptionDetails));
    mkdirSync(dirname(outputPath),{recursive:true});
    const nativeWindow=adb('shell','dumpsys','window','windows');
    writeFileSync(outputPath.replace(/\.json$/,'-bars-window.txt'),nativeWindow);
    const bars=verifyBarAppearance(nativeWindow,packageName,theme);
    writeFileSync(outputPath.replace(/\.json$/,'-bars.json'),JSON.stringify(bars,null,2));
    writeFileSync(outputPath.replace(/\.json$/,'-appearance.json'),JSON.stringify(check.result.result.value,null,2));
  }
  if(result?.url.includes('connection-error.html')) {
    const contrast=await evaluate(`(()=>{
      const ratio=(${contrastRatio.toString()});
      return ['.status','.note','#retry'].map(selector=>{
        const style=getComputedStyle(document.querySelector(selector));
        const stops=style.backgroundImage.match(/rgba?\\([^)]+\\)/g)||[style.backgroundColor];
        const minimum=Math.min(...stops.map(bg=>ratio(style.color,bg)));
        if(minimum<4.5)throw Error('Recovery text contrast below 4.5: '+selector);
        return {selector,minimum};
      });
    })()`);
    if(contrast.result.exceptionDetails)throw new Error(JSON.stringify(contrast.result.exceptionDetails));
    mkdirSync(dirname(outputPath),{recursive:true});
    writeFileSync(outputPath.replace(/\.json$/,'-contrast.json'),JSON.stringify(contrast.result.result.value,null,2));
  }
  if (result && action === "open-offline") {
    const parity = await evaluate(`(async () => {
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      const waitUntil = (${waitUntil.toString()});
      assert(document.querySelector('#page-title')?.getAttribute('aria-label')?.includes('شعر روز مولانا'), 'Daily poem missing');
      assert(document.querySelector('#gregorian-date')?.textContent.trim(), 'Gregorian date missing');
      assert(window.HamrahPoems?.length === 360, 'Bundled poems missing');
      assert(document.querySelectorAll('.poem-couplet').length===2,'Poem must have two rows');
      const row=document.querySelector('.poem-couplet'),a=row.children[0].getBoundingClientRect(),b=row.children[1].getBoundingClientRect();
      assert(Math.abs(a.top-b.top)<2&&a.left>b.left,'Poem must use two RTL columns on a phone');
      assert(document.documentElement.scrollWidth<=innerWidth+1,'Unwanted horizontal page scroll');
      await document.fonts.load('16px Vazirmatn', 'همراه');
      assert([...document.fonts].some((font) => font.family === 'Vazirmatn' && font.status === 'loaded'), 'Bundled Persian font did not load');
      const plugin = window.Capacitor?.Plugins?.LocalNotifications;
      assert(plugin, 'Native notification bridge missing');
      document.querySelector('[data-panel="settings"]').click();
      const offsets = [...document.querySelectorAll('input[name=reminder]')];
      assert(offsets.length === 3, 'Three reminder controls missing');
      offsets.forEach((input) => { input.checked = true; });
      document.querySelector('#reminder-form').requestSubmit();
      document.querySelector('[data-open-form]').click();
      document.querySelector('#task-title').value = 'کنترل سه یادآوری اندروید';
      assert(!document.querySelector('input[type="date"],input[type="time"],input[type="datetime-local"]'),'Native locale-dependent date/time picker remains');
      const wall=window.HamrahOffline.localDateInput(new Date(Date.now()+2*86400000)).split('T');
      const dateInput=document.querySelector('#task-date-control input');dateInput.value=window.HamrahInputs.dateInputValue(wall[0]);dateInput.dispatchEvent(new Event('change',{bubbles:true}));
      const timeInput=document.querySelector('#task-time-control input');timeInput.value=wall[1];timeInput.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#task-date-control details').open=true;
      assert(document.querySelectorAll('#task-date-control .picker-days button').length>=29,'Jalali month picker missing');
      const clockSelect=document.querySelector('#task-time-control select');assert(clockSelect.options.length===25,'24-hour picker missing');
      document.querySelector('#task-date-control details').open=false;
      document.querySelector('#task-form').requestSubmit();
      let task;
      for (let attempt = 0; attempt < 40; attempt++) {
        task = JSON.parse(localStorage.getItem('hamrah-local-v2') || '[]').find((item) => item.title === 'کنترل سه یادآوری اندروید');
        const pending = await plugin.getPending();
        if (task?.notificationIds?.length === 3 && task.notificationIds.every((id) => pending.notifications.some((item) => item.id === id))) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const pending = await plugin.getPending();
      assert(task?.notificationIds?.length === 3 && task.notificationIds.every((id) => pending.notifications.some((item) => item.id === id)), 'Three native reminders were not scheduled');
      document.querySelector('[data-panel="tasks"]').click();
      const reminderRow=[...document.querySelectorAll('#task-list .item')].find(item=>item.dataset.id===task.id);
      assert(reminderRow,'Scheduled task row missing');
      reminderRow.querySelector('[data-action="toggle"]').click();
      for (let attempt = 0; attempt < 30; attempt++) {
        if (JSON.parse(localStorage.getItem('hamrah-local-v2')||'[]').find(item=>item.id===task.id)?.done && !(await plugin.getPending()).notifications.some((item) => task.notificationIds.includes(item.id))) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      assert(!(await plugin.getPending()).notifications.some((item) => task.notificationIds.includes(item.id)), 'Completed task reminders were not cancelled');
      assert(JSON.parse(localStorage.getItem('hamrah-local-v2')||'[]').find(item=>item.id===task.id)?.done,'Task completion callback not finished');
      [...document.querySelectorAll('#task-list .item')].find(item=>item.dataset.id===task.id).querySelector('[data-action="delete"]').click();
      document.querySelector('#task-list [data-action="confirm-delete"]').click();
      await waitUntil(()=>!JSON.parse(localStorage.getItem('hamrah-local-v2')||'[]').some(item=>item.id===task.id),'Previous explicitly confirmed deletion did not finish');
      const beforeAssistant=JSON.parse(localStorage.getItem('hamrah-local-v2')||'[]').map(item=>item.id).sort();
      assert(window.HamrahPlanner?.planPersian,'Shared Persian planner missing');
      const leadingReminder=window.HamrahPlanner.planPersian('یادم بنداز فردا ساعت پنج عصر جلسه با تیم فروش دارم؛ سه ساعت قبل یادم بنداز',{});
      assert(leadingReminder.plan.title==='جلسه با تیم فروش'&&leadingReminder.plan.time==='17:00'&&leadingReminder.questions.length===0,'Leading reminder lost its subject or time');
      const expectedBg=window.HamrahAppearance.get()==='dark'?'#13151f':'#f7f7ff';
      assert(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()===expectedBg,'Canonical web palette mismatch');
      const navPaint=getComputedStyle(document.querySelector('.nav-button.new')).backgroundImage;
      const topPaint=getComputedStyle(document.querySelector('.top-actions [data-open-form]')).backgroundImage;
      assert(navPaint.includes('145deg')&&navPaint.includes('rgb(91, 112, 181)')&&navPaint.includes('rgb(79, 123, 114)'),'Navigation action lost canonical web gradient');
      assert(topPaint.includes('135deg')&&topPaint.includes('rgb(91, 112, 181)')&&topPaint.includes('rgb(79, 123, 114)'),'Top action lost canonical web gradient');
      if(window.HamrahAppearance.get()==='dark')assert(getComputedStyle(document.querySelector('.card')).borderTopColor==='rgb(57, 61, 80)','Dark cards retained a light border');
      document.querySelector('[data-panel="assistant"]').click();
      document.querySelector('#assistant-input').value='فردا ساعت پنج عصر جلسه با تیم فروش دارم؛ یک روز قبل، سه ساعت قبل و یک ساعت قبل یادم بنداز و آلارم هم بگذار.';
      document.querySelector('#assistant-send').click();
      assert(document.querySelector('[data-plan="title"]').value==='جلسه با تیم فروش','Persian title extraction failed');
      assert(window.HamrahInputs.inputDigits(document.querySelector('#assistant-result input[aria-label="ساعت ۲۴ساعته"]').value)==='17:00','Afternoon time extraction failed');
      assert(!document.querySelector('[data-plan="durationMinutes"],[data-plan="quietStart"],[data-plan="quietEnd"],[data-plan="operation"],[data-plan="entity"]'),'Removed controls remain');
      assert(!document.querySelector('#local-plan-confirm').disabled,'Unchanged proposal must be confirmable');
      const review=document.querySelector('#assistant-result');
      assert(!review.querySelector('.approval-details').open,'Long editor must start collapsed');
      assert(review.querySelector('.approval-summary').textContent.includes('۳ ساعت قبل'),'Selected reminders missing from compact summary');
      assert(review.querySelector('.approval-summary').textContent.includes('Alarm'),'Selected alarm hidden before confirmation');
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const submitRect=document.querySelector('#local-plan-confirm').getBoundingClientRect();
      assert(submitRect.top>=0&&submitRect.bottom<innerHeight-65,'Confirmation button is outside the usable viewport');
      review.querySelector('.approval-details').open=true;
      const titleInput=document.querySelector('[data-plan="title"]');titleInput.value='جلسه با تیم فروش تهران';titleInput.dispatchEvent(new Event('change',{bubbles:true}));
      assert(document.querySelector('[data-plan="title"]').value==='جلسه با تیم فروش تهران','Title edit was lost');
      document.querySelector('#local-plan-cancel').click();
      assert(document.querySelector('#assistant-result').textContent.includes('لغو شد'),'Cancel result missing');
      const afterAssistant=JSON.parse(localStorage.getItem('hamrah-local-v2')||'[]').map(item=>item.id).sort();
      assert(JSON.stringify(afterAssistant)===JSON.stringify(beforeAssistant),'Unapproved draft changed task IDs: '+JSON.stringify({before:beforeAssistant,after:afterAssistant}));
      document.querySelector('#assistant-input').value='پس فردا ساعت 17 کنترل کانال داخلی بساز؛ یک ساعت قبل یادآوری کن';
      document.querySelector('#assistant-send').click();
      assert(!document.querySelector('#local-plan-confirm').disabled,'In-app-only proposal not ready');
      const pendingBefore=(await plugin.getPending()).notifications.map(n=>n.id).sort().join(',');
      document.querySelector('#local-plan-confirm').click();
      await new Promise(resolve=>setTimeout(resolve,300));
      document.querySelector('[data-panel="settings"]').click();
      document.querySelector('#enable-notifications').click();
      await new Promise(resolve=>setTimeout(resolve,500));
      assert((await plugin.getPending()).notifications.map(n=>n.id).sort().join(',')===pendingBefore,'Permission resync ignored approved in-app-only channel');
      document.querySelector('[data-panel="tasks"]').click();
      const internal=[...document.querySelectorAll('#task-list .item')].find(item=>item.textContent.includes('کنترل کانال داخلی'));
      assert(internal,'Approved local task missing');
      internal.querySelector('[data-action="delete"]').click();
      document.querySelector('#task-list [data-action="confirm-delete"]').click();
      await waitUntil(()=>!JSON.parse(localStorage.getItem('hamrah-local-v2')||'[]').some(item=>item.id===internal.dataset.id),'In-app test deletion did not finish');
      document.querySelector('[data-panel="assistant"]').click();
      document.querySelector('#assistant-input').value='فردا ساعت پنج جلسه با تیم فروش دارم';
      document.querySelector('#assistant-send').click();
      document.querySelector('#local-plan-confirm').click();
      assert(document.querySelector('input[aria-label="ساعت ۲۴ساعته"]').closest('label').querySelector('.field-error')?.textContent.includes('ساعت'),'Missing inline ambiguity error');
      document.querySelector('#local-plan-cancel').click();
      document.querySelector('[data-panel="today"]').click();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return { poem: true, gregorianDate: true, persianFont: true, nativeReminders: 3, cancellation: true, sharedPalette:true, persianPlanner:true, editableApproval:true, noEffectsBeforeConfirmation:true, approvedChannelIsolation:true, jalaliPicker:true, clock24:true, simplifiedApproval:true, compactApproval:true };
    })()`);
    if (parity?.result?.exceptionDetails) throw new Error(`Offline feature QA failed: ${JSON.stringify(parity.result.exceptionDetails)}`);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath.replace(/\.json$/, "-parity.json"), JSON.stringify(parity.result.result.value, null, 2));
    process.stdout.write(`Offline parity: ${JSON.stringify(parity.result.result.value)}\n`);
    // A real emulator keyboard, not just a resized browser viewport.
    const keyboardSetup=await evaluate(`(async()=>{
      document.querySelector('[data-panel="assistant"]').click();
      document.querySelector('#assistant-input').value='پس فردا ساعت 17 بررسی کیبورد بساز';
      document.querySelector('#assistant-send').click();
      const review=document.querySelector('#assistant-result');review.querySelector('.approval-details').open=true;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const field=review.querySelector('[data-plan="title"]');field.scrollIntoView({block:'nearest'});
      const b=field.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,w:innerWidth,h:innerHeight};
    })()`);
    if(keyboardSetup.result.exceptionDetails)throw new Error('Keyboard setup failed');
    const point=keyboardSetup.result.result.value;
    const beforeKeyboardPrefix=outputPath.replace(/\.json$/,'-keyboard-before-system-ui');
    execFileSync(process.execPath,['scripts/android-system-ui-check.mjs',beforeKeyboardPrefix],{stdio:'inherit'});
    const tree=readFileSync(`${beforeKeyboardPrefix}-before.xml`,'utf8');
    writeFileSync(outputPath.replace(/\.json$/,'-keyboard-before.xml'),tree);
    const webNode=[...tree.matchAll(/<node\s[^>]+/g)].map(m=>m[0]).find(n=>n.includes('class="android.webkit.WebView"'));
    const bounds=webNode?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if(!bounds)throw new Error('Cannot locate real WebView bounds for keyboard tap');
    const x=Math.round(+bounds[1]+point.x*(+bounds[3]- +bounds[1])/point.w),y=Math.round(+bounds[2]+point.y*(+bounds[4]- +bounds[2])/point.h);
    adb('shell','input','tap',String(x),String(y));
    let ime='';for(let attempt=0;attempt<5;attempt++){await delay(1000);ime=adb('shell','dumpsys','input_method');if(/(?:mInputShown|mIsInputViewShown|isInputViewShown)=true/.test(ime))break;}
    writeFileSync(outputPath.replace(/\.json$/,'-keyboard-ime.txt'),ime);
    if(!/(?:mInputShown|mIsInputViewShown|isInputViewShown)=true/.test(ime))throw new Error('Real Android keyboard did not open');
    const keyboardCheck=await evaluate(`(()=>{
      const button=document.querySelector('#local-plan-confirm'),field=document.querySelector('[data-plan="title"]');
      const b=button.getBoundingClientRect(),f=field.getBoundingClientRect(),nav=document.querySelector('.bottom-nav').getBoundingClientRect();
      const bottom=Math.min(visualViewport?.height||innerHeight,nav.top);
      return {keyboard:true,active:document.activeElement===field,buttonVisible:b.top>=0&&b.bottom<bottom,inputVisible:f.top>=0&&f.bottom<bottom,bottom,buttonBottom:b.bottom,inputBottom:f.bottom};
    })()`);
    const keyboard=keyboardCheck.result.result.value;
    writeFileSync(outputPath.replace(/\.json$/,'-keyboard.json'),JSON.stringify(keyboard));
    execFileSync(process.execPath,['scripts/android-system-ui-check.mjs',outputPath.replace(/\.json$/,'-keyboard-system-ui'),'inspect',outputPath.replace(/\.json$/,'-keyboard.png')],{stdio:'inherit'});
    if(!keyboard?.active||!keyboard.buttonVisible||!keyboard.inputVisible)throw new Error(`Keyboard obscures confirmation or input: ${JSON.stringify(keyboard)}`);
    adb('shell','input','keyevent','KEYCODE_BACK');
    const cleanup=await evaluate(`(async()=>{
      document.querySelector('#local-plan-cancel').click();
      if(!document.querySelector('#assistant-result').textContent.includes('لغو شد'))throw Error('Keyboard draft cancellation missing');
      document.querySelector('[data-panel="today"]').click();window.scrollTo(0,0);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      if(!document.querySelector('#today-panel').classList.contains('active'))throw Error('Today panel did not reopen');
      return true;
    })()`);
    if(cleanup?.result?.exceptionDetails)throw new Error('Keyboard QA cleanup failed: '+JSON.stringify(cleanup.result.exceptionDetails));
    await delay(500);
  }
  socket.close();

  if (!result) {
    throw new Error(`Expected Persian text was not rendered within the timeout: ${requiredText}. Last page: ${JSON.stringify(lastCandidate)}`);
  }
  if (result.direction !== "rtl") throw new Error("Android WebView document is not RTL.");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({ ...result, packageName, pid }, null, 2)}\n`, "utf8");
  process.stdout.write(`${result.title}\n${result.url}\n${result.text.slice(0, 500)}\n`);
}

await inspect();
