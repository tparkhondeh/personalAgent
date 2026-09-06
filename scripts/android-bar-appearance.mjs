// A dark page with black status icons is not visually correct, even if JS passed.
export function verifyBarAppearance(dump, packageName, theme) {
  if(!['light','dark'].includes(theme))throw new Error('Unknown appearance');
  const block=dump.split(/\n\s*Window #\d+ /).find(part=>part.includes(`package=${packageName} `)&&part.includes('ty=BASE_APPLICATION')&&part.includes('/ir.wealthos.personalagent.MainActivity'));
  if(!block?.includes('mAttrs={'))throw new Error('Missing main Android window appearance');
  const attrs=block.slice(block.indexOf('mAttrs={'),block.indexOf('Requested w='));
  const statusDarkIcons=/\bLIGHT_STATUS_BARS?\b/.test(attrs);
  const navigationDarkIcons=/\bLIGHT_NAVIGATION_BARS?\b/.test(attrs);
  const expected=theme==='light';
  if(statusDarkIcons!==expected||navigationDarkIcons!==expected)throw new Error(`Native bar contrast mismatch for ${theme}`);
  return {theme,statusDarkIcons,navigationDarkIcons,verified:true};
}
