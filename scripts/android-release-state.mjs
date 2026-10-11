// A health probe made minutes before emulator boot is not a promise that the
// public network remains available. Classify the real screen; never call the
// offline recovery screen a successful connected launch.
export function classifyReleaseUi(xml) {
  const online = xml.includes("فهرست برنامه‌ها");
  const recovery = xml.includes("اتصال برقرار نشد") && xml.includes("تلاش دوباره") && xml.includes("ادامه در حالت محلی");
  if (online === recovery) return null;
  return online ? "online" : "recovery";
}
