// Wait for an observable postcondition, never assume native callbacks finish in
// a fixed sleep. This helper is also serialized into the emulator's page scope.
export async function waitUntil(check,message,{attempts=40,delayMs=100}={}) {
  for(let attempt=0;attempt<attempts;attempt++){
    if(await check())return;
    if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  throw new Error(message);
}
