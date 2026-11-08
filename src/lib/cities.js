// Coordonnées des villes desservies (mêmes noms que le backend : transport.services.CITIES).
export const CITY_COORDS = {
  Lusaka: [-15.4167, 28.2833], Kitwe: [-12.8024, 28.2132], Ndola: [-12.9587, 28.6366], Livingstone: [-17.8419, 25.8543],
  Kabwe: [-14.4469, 28.4464], Chipata: [-13.6333, 32.65], Kasama: [-10.2129, 31.1808], Solwezi: [-12.1688, 26.3894],
  Mongu: [-15.2484, 23.1274], Mansa: [-11.1996, 28.8943], Choma: [-16.8064, 26.9833], Mazabuka: [-15.8586, 27.7469],
  "Kapiri Mposhi": [-13.9667, 28.6833], Chingola: [-12.5289, 27.8531], Mufulira: [-12.5497, 28.2403], Luanshya: [-13.1367, 28.4167],
  Siavonga: [-16.5333, 28.7167], Petauke: [-14.2478, 31.3249], Lubumbashi: [-11.6609, 27.4794], Kolwezi: [-10.7167, 25.4667],
  Harare: [-17.8252, 31.0335], Johannesburg: [-26.2041, 28.0473], "Dar es Salaam": [-6.7924, 39.2083], Nairobi: [-1.2921, 36.8219],
  Kinshasa: [-4.4419, 15.2663],
};
export const coordOf = (name) => CITY_COORDS[Object.keys(CITY_COORDS).find((k) => k.toLowerCase() === String(name || "").trim().toLowerCase())] || null;
