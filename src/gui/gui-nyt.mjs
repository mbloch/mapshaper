import { GUI } from './gui-lib';
import { isInstalledFont } from './gui-label-fonts';

// Features offered only to people at The New York Times, who are the ones with
// its NYTFranklin typeface installed. This is a convenience, not access
// control: anything gated here must still render for everyone, because a map
// made with it can be opened anywhere.
//
// ?nyt=on or ?nyt=off in the page URL overrides the check, so that the gated
// features can be tested (and hidden) on any machine.
var NYT_FONT = 'NYTFranklin';
var cached;

export function isNytUser() {
  if (cached === undefined) cached = detectNytUser();
  return cached;
}

function detectNytUser() {
  var flag = GUI.getUrlVars().nyt;
  if (flag == 'on' || flag === true) return true;
  if (flag == 'off' || flag === false) return false;
  return isInstalledFont(NYT_FONT);
}
