export function validAgentOrigin(request:Request){
  const origin=request.headers.get("origin");
  if(!origin)return false;
  const allowed=[new URL(request.url).origin];
  if(process.env.BETTER_AUTH_URL){try{allowed.push(new URL(process.env.BETTER_AUTH_URL).origin);}catch{}}
  return allowed.includes(origin);
}
