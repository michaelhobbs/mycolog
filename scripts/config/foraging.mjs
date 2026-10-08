// Source URLs for the German foraging-status snapshot. Kept in one place so a
// new Red List cycle or a renumbered law section is a deliberate edit.
//
// BArtSchV: the consolidated text on gesetze-im-internet.de (Bundesamt fuer
// Justiz), not a hand copy -- Annex 1 is the list of "besonders geschuetzt"
// species, Section 2(1) the small-quantity / personal-use exemption for fungi.
export const BARTSCHV_ANLAGE_1_URL =
  'https://www.gesetze-im-internet.de/bartschv_2005/anlage_1.html'
export const BARTSCHV_SECTION_2_URL = 'https://www.gesetze-im-internet.de/bartschv_2005/__2.html'
export const BNATSCHG_SECTION_39_URL = 'https://www.gesetze-im-internet.de/bnatschg_2009/__39.html'

// Red List of macrofungi (cycle 2009ff, published 2016), BfN via the
// Rote-Liste-Zentrum. One ZIP holds both data tables (Staender- and
// Schlauchpilze), both legends, the errata and the required citation.
export const RED_LIST_ZIP_URL =
  'https://www.rote-liste-zentrum.de/wp-content/uploads/Download_RoteListe_Grosspilze_2016_20210317-1608.zip'

// The long citation the bundled 01_Informationen HTML demands when the data is
// used. Verbatim from that file; if the URL above is ever swapped for a newer
// cycle, this string must be swapped with it.
export const RED_LIST_CITATION =
  'Dämmrich et al. (2016): Rote Liste der Großpilze und vorläufige Gesamtartenliste der Ständer- ' +
  'und Schlauchpilze (Basidiomycota und Ascomycota) Deutschlands. In: Matzke-Hajek, Hofbauer & ' +
  'Ludwig (Hrsg.), Rote Liste gefährdeter Tiere, Pflanzen und Pilze Deutschlands, Band 8, ' +
  'Naturschutz und Biologische Vielfalt 70 (8), 31-433.'
