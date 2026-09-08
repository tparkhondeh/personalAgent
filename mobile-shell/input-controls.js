// DOM adapters for the same calendar/clock arithmetic used by React.
(() => {
  const api=window.HamrahInputs;
  function input(root,label,value,onChange){const el=document.createElement("input");el.type="text";el.dir="ltr";el.inputMode="numeric";el.setAttribute("aria-label",label);el.value=api.faDigits(value);el.addEventListener("input",()=>onChange(el.value));el.addEventListener("change",()=>onChange(el.value));root.append(el);return el;}
  function details(root,label){const d=document.createElement("details"),s=document.createElement("summary");s.textContent=label;d.append(s);root.append(d);return d;}
  function button(text,click){const b=document.createElement("button");b.type="button";b.textContent=text;b.onclick=click;return b;}
  function date(root,value,onChange,label="تاریخ شمسی"){
    root.replaceChildren();root.classList.add("date-time-control");
    const el=input(root,label,api.dateInputValue(value),text=>{value=api.parsePersianInput(text);el.setAttribute("aria-invalid",String(value.startsWith("invalid:")));onChange(value);});
    el.placeholder="۱۴۰۵/۰۶/۱۵";
    const d=details(root,"انتخاب از تقویم");
    const initial=api.persianParts(value)||api.persianParts(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tehran"}).format(new Date()));
    let year=initial.year,month=initial.month;
    const box=document.createElement("span");box.className="calendar-picker";d.append(box);
    function draw(){
      box.replaceChildren();const head=document.createElement("span");head.className="picker-header";
      const move=delta=>{const i=year*12+month-1+delta;year=Math.floor(i/12);month=i%12+1;draw();};
      const prev=button("ماه قبل",()=>move(-1)),next=button("ماه بعد",()=>move(1));prev.disabled=year===1300&&month===1;next.disabled=year===1500&&month===12;
      const title=document.createElement("strong");title.textContent=api.persianMonths[month-1]+" "+api.faDigits(year);head.append(prev,title,next);box.append(head);
      const grid=document.createElement("span");grid.className="picker-days";box.append(grid);
      for(const day of ["ش","ی","د","س","چ","پ","ج"]){const e=document.createElement("small");e.textContent=day;grid.append(e);}
      const data=api.persianMonthGrid(year,month);
      for(let i=0;i<data.offset;i++)grid.append(document.createElement("span"));
      for(const day of data.days){const b=button(api.faDigits(day.day),()=>{value=day.iso;el.value=api.faDigits(api.dateInputValue(value));d.open=false;onChange(value);});b.setAttribute("aria-label",api.faDigits(day.day)+" "+api.persianMonths[month-1]+" "+api.faDigits(year));b.setAttribute("aria-pressed",String(day.iso===value));grid.append(b);}
    }draw();
    if(value.startsWith("invalid:")){const e=document.createElement("small");e.className="field-error";e.textContent="تاریخ شمسی معتبر وارد کن.";root.append(e);}
  }
  function time(root,value,onChange,label="ساعت ۲۴ساعته"){
    root.replaceChildren();root.classList.add("date-time-control");
    const el=input(root,label,value,text=>{value=api.inputDigits(text);el.setAttribute("aria-invalid",String(!!value&&!api.validTime24(value)));onChange(value);});el.maxLength=5;el.placeholder="۰۰:۰۰";
    const d=details(root,"انتخاب ساعت"),box=document.createElement("span");box.className="clock-picker";box.dir="ltr";d.append(box);
    const parts=value.split(":");
    for(let i=0;i<2;i++){const select=document.createElement("select");select.setAttribute("aria-label",label+(i?" — دقیقه":" — ساعت"));select.add(new Option(i?"دقیقه":"ساعت",""));for(let n=0;n<(i?60:24);n++){const v=String(n).padStart(2,"0");select.add(new Option(api.faDigits(v),v));}select.value=parts[i]||"";select.onchange=()=>{parts[i]=select.value;value=(parts[0]||"00")+":"+(parts[1]||"00");el.value=api.faDigits(value);onChange(value);};box.append(select);}
    if(value&&!api.validTime24(value)){const e=document.createElement("small");e.className="field-error";e.textContent="ساعت را از ۰۰:۰۰ تا ۲۳:۵۹ وارد کن.";root.append(e);}
  }
  window.HamrahControls={date,time};
})();
