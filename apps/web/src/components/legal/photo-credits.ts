// The 15 canvas photos in public/photos. docs/image-credits.md has the full titles and licenses.
// 13 photos are CC BY 2.0, which requires a credit on each page that shows them.
export interface PhotoCredit {
  /** The file name in public/photos, without .jpg. */
  img: string;
  /** The sample song name that the canvas gives to this cover. */
  song: string;
  creator: string;
  license: 'CC0 1.0' | 'CC BY 2.0';
  source: string;
}

export const PHOTO_CREDITS: PhotoCredit[] = [
  { img: 'i1', song: 'The Cat Who Sailed', creator: 'Jebulon', license: 'CC0 1.0', source: 'https://commons.wikimedia.org/w/index.php?curid=51505686' },
  { img: 'i2', song: 'Lantern Over Dunmoor', creator: 'eskel_kreig', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/130154986@N04/27962766846' },
  { img: 'i3', song: 'Weld and Woad', creator: 'firepile', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/17643132@N00/30517837' },
  { img: 'i4', song: 'Salt on the Tollgate', creator: 'kewl', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/58411470@N00/8763362960' },
  { img: 'i5', song: 'Night at the Grey Hart', creator: 'Markus Grossalber', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/58883622@N02/8339565200' },
  { img: 'i6', song: 'Harbour Lights', creator: 'DanBrady', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/11853009@N07/2068433063' },
  { img: 'i7', song: 'Low Tide Waltz', creator: 'Sam Howzit', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/12508217@N08/5200112333' },
  { img: 'i8', song: 'Copper Kettle', creator: 'Krzysztof Puszczyński', license: 'CC0 1.0', source: 'https://stocksnap.io/photo/turntable-record-0RN44JI11G' },
  { img: 'i9', song: 'North Road', creator: 'Steve Snodgrass', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/10710442@N08/3874913760' },
  { img: 'i10', song: 'The Long Ferry', creator: 'blacklerphotos', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/110255976@N07/11140908364' },
  { img: 'i11', song: 'Wren Song', creator: 'Schill', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/12289718@N00/7586864728' },
  { img: 'i12', song: 'Paper Moons', creator: 'Steve Evans', license: 'CC BY 2.0', source: 'https://commons.wikimedia.org/w/index.php?curid=914844' },
  { img: 'p1', song: '', creator: 'Oslo In The Summertime', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/77468730@N00/411236247' },
  { img: 'p2', song: '', creator: 'TehShrike', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/36000507@N05/4100063096' },
  { img: 'p3', song: '', creator: 'ma_il', license: 'CC BY 2.0', source: 'https://www.flickr.com/photos/46054903@N00/3600504648' },
];

export const COVER_CREDITS = PHOTO_CREDITS.filter((credit) => credit.song);
