var StateNames = {};

/**
 * State names, indexed by postal abbreviation.
 */
StateNames.index = {
  'AL': 'Alabama',
  'AK': 'Alaska',
  'AZ': 'Arizona',
  'AR': 'Arkansas',
  'CA': 'California',
  'CO': 'Colorado',
  'CT': 'Connecticut',
  'DE': 'Delaware',
  //'DC':"Washington D.C.",
  //'DC':"District of Columbia",
  'DC': 'D.C.',
  'FL': 'Florida',
  'GA': 'Georgia',
  'HI': 'Hawaii',
  'ID': 'Idaho',
  'IL': 'Illinois',
  'IN': 'Indiana',
  'IA': 'Iowa',
  'KS': 'Kansas',
  'KY': 'Kentucky',
  'LA': 'Louisiana',
  'ME': 'Maine',
  'MD': 'Maryland',
  'MA': 'Massachusetts',
  'MI': 'Michigan',
  'MN': 'Minnesota',
  'MS': 'Mississippi',
  'MO': 'Missouri',
  'MT': 'Montana',
  'NE': 'Nebraska',
  'NV': 'Nevada',
  'NH': 'New Hampshire',
  'NJ': 'New Jersey',
  'NM': 'New Mexico',
  'NY': 'New York',
  'NC': 'North Carolina',
  'ND': 'North Dakota',
  'OH': 'Ohio',
  'OK': 'Oklahoma',
  'OR': 'Oregon',
  'PA': 'Pennsylvania',
  'PR': 'Puerto Rico',
  'RI': 'Rhode Island',
  'SC': 'South Carolina',
  'SD': 'South Dakota',
  'TN': 'Tennessee',
  'TX': 'Texas',
  'UT': 'Utah',
  'VT': 'Vermont',
  'VA': 'Virginia',
  'WA': 'Washington',
  'WV': 'West Virginia',
  'WI': 'Wisconsin',
  'WY': 'Wyoming'
};

// IMPORTANT: trailing ','
StateNames.abbrev = "AL:Ala.,AK:Alaska,AZ:Ariz.,AR:Ark.,CA:Calif.,CO:Colo.,CT:Conn.,DE:Del.,DC:D.C.,FL:Fla.,GA:Ga.,HI:Hawaii,ID:Idaho,IL:Ill.,IN:Ind.,IA:Iowa,KS:Kan.,KY:Ky.,LA:La.,ME:Me.,MD:Md.,MA:Mass.,MI:Mich.,MN:Minn.,MS:Miss.,MO:Mo.,MT:Mont.,NE:Neb.,NV:Nev.,NH:N.H.,NJ:N.J.,NM:N.M.,NY:N.Y.,NC:N.C.,ND:N.D.,OH:Ohio,OK:Okla.,OR:Ore.,PA:Pa.,PR:P.R.,RI:R.I.,SC:S.C.,SD:S.D.,TN:Tenn.,TX:Tex.,UT:Utah,VT:Vt.,VA:Va.,WA:Wash.,WV:W.Va.,WI:Wis.,WY:Wyo.,";

/**
 * Convert state postal abbreviations to state names.
 * @param {string} st State postal code.
 * @return {string} Full state name.
 */
StateNames.getName = function(st) {
  var name = StateNames.index[st];
  return name || '';
};

//StateNames._rxp = /[^,]+/g;

StateNames.getAbbrev = function(st) {
  st = st && st.toUpperCase();
  var i = this.abbrev.indexOf(st);
  var str = st && i > -1 ? this.abbrev.substring(i + 3, this.abbrev.indexOf(',', i)) : "";
  return str;
};