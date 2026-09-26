export function assertDeliveredQaHost({ ci, serial, emulator }) {
  if (ci !== 'true' || !/^emulator-\d+$/.test(serial) || emulator !== '1') {
    throw Error('Delivered-notification QA requires an isolated CI emulator');
  }
}

// Serialized into the real offline WebView. Never substitutes a mock native bridge.
export async function androidDeliveredNotificationQa(task, isolation) {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const wait = async (check, message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await check()) return;
      if (attempt < 99) await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error(message);
  };
  assert(isolation === 'ci-emulator-delivered-qa' && location.origin === 'https://localhost'
    && window.Capacitor?.getPlatform?.() === 'android', 'Native fixture isolation missing');
  const plugin = window.Capacitor.Plugins.LocalNotifications;
  const records = () => JSON.parse(localStorage.getItem('hamrah-local-v2') || '[]');
  assert(task.title.startsWith('tia-qa-delivered-') && !task.done && task.notificationIds.length === 3
    && records().some(item => item.id === task.id && item.title === task.title && !item.done), 'Expected the new synthetic UI record');
  const pendingBefore = (await plugin.getPending()).notifications;
  const deliveredBefore = (await plugin.getDeliveredNotifications()).notifications;
  const targetId = task.notificationIds[0];
  assert(task.notificationIds.every(id => pendingBefore.some(item => item.id === id && item.extra?.owner === 'hamrah-local'
    && item.extra?.taskId === task.id && new Date(item.schedule?.at).getTime() > Date.now()))
    && !deliveredBefore.some(item => task.notificationIds.includes(item.id)), 'Fixture reminders are not fresh owned future alarms');
  const used = new Set([...pendingBefore, ...deliveredBefore].map(item => item.id));
  for (const item of records()) for (const id of item.notificationIds || []) used.add(id);
  let unrelatedId = 2147000000;
  while (used.has(unrelatedId) && unrelatedId > 2146999900) unrelatedId--;
  assert(!used.has(unrelatedId), 'No isolated fixture notification ID available');
  // getPending serializes java.util.Date at second precision. Align this NEW
  // fixture before scheduling; retain exact equality when checking preservation.
  const futureAt = Math.ceil(Date.now() / 1000) * 1000 + 4 * 86400000;
  const extra = { owner: 'tia-delivered-qa', taskId: task.id, fixture: task.title };
  const channelId = 'tia-qa-delivered-v1';
  await plugin.createChannel({ id: channelId, name: 'Synthetic delivered-notification QA', importance: 2 });
  await plugin.schedule({ notifications: [
    { id: targetId, title: task.title, body: 'Synthetic delivered fixture', channelId,
      schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
      extra: { owner: 'hamrah-local', taskId: task.id, fixture: task.title } },
    { id: unrelatedId, title: task.title, body: 'Synthetic unrelated future fixture', channelId,
      schedule: { at: new Date(futureAt), allowWhileIdle: true }, extra },
  ] });
  await wait(async () => (await plugin.getDeliveredNotifications()).notifications.some(item => item.id === targetId),
    'Synthetic notification was never actually delivered');
  const deliveredPending = (await plugin.getPending()).notifications;
  assert(deliveredPending.some(item => item.id === targetId && item.extra?.owner === 'hamrah-local' && item.extra?.taskId === task.id),
    'Delivered fixture did not exercise the retained native storage row');
  const unrelatedMatches = item => item.id === unrelatedId && item.extra?.owner === extra.owner
    && item.extra?.taskId === extra.taskId && item.extra?.fixture === extra.fixture
    && new Date(item.schedule?.at).getTime() === futureAt;
  assert(deliveredPending.some(unrelatedMatches), 'Unrelated future fixture was not scheduled');
  document.querySelector('button[data-panel="tasks"]').click();
  const row = [...document.querySelectorAll('#task-list .item')].find(item => item.dataset.id === task.id);
  assert(row, 'Delivered fixture task row missing');
  row.querySelector('[data-action="toggle"]').click();
  await wait(async () => records().find(item => item.id === task.id)?.done === true
    && !(await plugin.getPending()).notifications.some(item => task.notificationIds.includes(item.id))
    && !(await plugin.getDeliveredNotifications()).notifications.some(item => task.notificationIds.includes(item.id)),
  'UI completion left pending or delivered notifications');
  assert(![...document.querySelectorAll('#task-list .item,#dated-list .item')].some(item => item.dataset.id === task.id),
    'Completed fixture remains in an active list');
  assert((await plugin.getPending()).notifications.some(unrelatedMatches), 'Completion cancelled the unrelated future alarm');
  // Only our unrelated future sentinel is cleaned up, AFTER the app passed.
  // Never cancel/remove the target from QA: that would conceal the app regression.
  await plugin.cancel({ notifications: [{ id: unrelatedId }] });
  await wait(async () => !(await plugin.getPending()).notifications.some(item => item.id === unrelatedId),
    'Unrelated synthetic fixture cleanup did not finish');
  return { passed: true, deliveredObserved: true, retainedNativeRowObserved: true,
    completedViaUi: true, pendingRemoved: true, deliveredRemoved: true, unrelatedPreserved: true };
}
