// A card's title is set in capitals by its style; a unit in it keeps its own case ("mL/day", never "ML/DAY"; Mohammad's pick, 20 Oct).
// titleParts('Fluid balance · mL/day') -> ['Fluid balance · ', 'mL/day', '']: the odd entries are units, each for its own span.
const UNIT = /\b(mmHg|kPa|mL(?:\/(?:day|min))?|L\/min|cm\/s|m\/s)(?![\w/])/g;

export const titleParts = (text) => String(text).split(UNIT);
