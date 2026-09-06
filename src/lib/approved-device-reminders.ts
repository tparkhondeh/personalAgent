"use client";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeAndroid } from "@/lib/native-escalations";
import { nativeNotificationId } from "@/lib/escalations";
const owner="hamrah-approved-reminders";
let generation=0;
let queue:Promise<string>=Promise.resolve("");
export function clearApprovedDeviceReminders(){
  generation++;
  const next=queue.then(async()=>{
    if(!isNativeAndroid())return "";
    const pending=await LocalNotifications.getPending();
    const owned=pending.notifications.filter(n=>n.extra?.owner===owner);
    if(owned.length)await LocalNotifications.cancel({notifications:owned.map(n=>({id:n.id}))});
    return "";
  });queue=next.catch(()=>"");return next;
}
export function syncApprovedDeviceReminders(){
  const current=generation;
  const next=queue.then(()=>current===generation?sync():"");queue=next.catch(()=>"");return next;
}
async function sync() {
  if(!isNativeAndroid())return "Notification و Alarm فقط داخل اپ اندروید و پس از اجازه گوشی تنظیم می‌شوند.";
  const response=await fetch("/api/agent/alarms",{cache:"no-store"});
  if(!response.ok)throw new Error("sync failed");
  const body=await response.json();
  const pending=await LocalNotifications.getPending();
  const expected=new Set(body.data.map((r:{id:string})=>nativeNotificationId(r.id)));
  const obsolete=pending.notifications.filter(n=>n.extra?.owner===owner && !expected.has(n.id));
  if(obsolete.length)await LocalNotifications.cancel({notifications:obsolete.map(n=>({id:n.id}))});
  const permission=await LocalNotifications.checkPermissions();
  if(permission.display!=="granted")return "ثبت انجام شد؛ Notification به اجازه در تنظیمات اعلان نیاز دارد.";
  await LocalNotifications.createChannel({id:"approved-reminders",name:"یادآوری‌های تأییدشده",importance:5,sound:"urgent_alarm.wav",vibration:true});
  await LocalNotifications.createChannel({id:"approved-notifications",name:"اعلان برنامه",importance:3,vibration:true});
  const exact=await LocalNotifications.checkExactNotificationSetting();
  const notifications=body.data.filter((r:{scheduledFor:string})=>Date.parse(r.scheduledFor)>Date.now()).map((r:{id:string;title:string;scheduledFor:string;channel:string})=>({id:nativeNotificationId(r.id),title:"همراه",body:r.title,channelId:r.channel==="ALARM"?"approved-reminders":"approved-notifications",smallIcon:"ic_stat_hamrah",schedule:{at:new Date(r.scheduledFor),allowWhileIdle:r.channel==="ALARM"},extra:{owner,reminderId:r.id}}));
  if(notifications.length)await LocalNotifications.schedule({notifications});
  return `${notifications.length} Notification تنظیم شد.${exact.exact_alarm!=="granted"?" مجوز Alarm دقیق داده نشده؛ زمان اجرا ممکن است جابه‌جا شود.":""}`;
}
