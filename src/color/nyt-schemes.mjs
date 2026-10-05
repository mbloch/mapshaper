// The New York Times's map palettes: hand-picked sets of colors, each of a
// set size (the number in a name like nyt-blue3). Other numbers of colors are
// interpolated between a set's colors. The GUI offers them only to NYT users
// (see gui-nyt.mjs), and -colors doesn't list them, but -classify takes their
// names, so that a command that uses one runs anywhere.
// Colors are packed as six hex digits each.
export var nytSequential = {
  'nyt-blue3': 'bfdff95189b8315e82',
  'nyt-red3': 'eb8571c441278c1f02',
  'nyt-purple3': 'e3cce3ba9bba5c455c',
  'nyt-red4': 'ffbaadeb8571c441278c1f02',
  'nyt-dem4': 'ceeafd92bde05295cc1375b7',
  'nyt-rep4': 'fce0e0eaa9a9db7171c93135',
  'nyt-hot': 'f5ed90f8c081f6934cd75739a72022',
  'nyt-cool': 'f6f6cdc3e4d157c1cf108693104777'
};

// An odd number of colors, the middle one for the pivot class
export var nytDiverging = {
  'nyt-drought': '8c5322d9b466f5e7c3f5f6f6c8e8e45bb4ac06675f',
  // three colors a side and no pivot class; the center color is drought's,
  // for a scheme that has one
  'nyt-heat': 'c44027ed833af9af72f5f6f692cccd2f919006685f'
};

// Diverging sets made for classes without a pivot class
export var nytCenterless = ['nyt-heat'];

export var nytCategorical = {
  'nyt-3a': 'abc6dbfade91f5a442',
  'nyt-3b': 'fade91f5a4426b6159',
  'nyt-3c': 'd1776dfcb9589bb8d7',
  'nyt-3d': 'a8a8a8ffb861c44127',
  'nyt-5': 'bfd6d18eada5e8c051947213d48474',
  'nyt-6': 'e3e1daadb9c1fade91d7543af5a4425189b8',
  'nyt-7': 'ba9bba8eada5daccb9e09c90969284ffd29cb6a58c',
  'nyt-energy': '68624de393259b71b08dd3dd739ac1f6d836d46ba8',
  'nyt-dem-p': '8357aa3b99a7e26e42ffb609bd457931803d6794ffe7c47e82dcad9f472efff063',
  'nyt-rep-p': 'cf222cdda2003ca0a06651b7b45e09c22d737faa0050487b933da53ab9bf'
};
