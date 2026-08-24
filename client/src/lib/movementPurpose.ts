const buildingCode = "[A-Za-z]{1,2}\\d{0,3}";
const buildingGroup = new RegExp(`^${buildingCode}(?:\\s*(?:&|و|,|/|\\+|-|–)\\s*${buildingCode})*$`, "i");
const buildingGroupAtEnd = new RegExp(`^(.+?)\\s+(${buildingCode}(?:\\s*(?:&|و|,|/|\\+|-|–)\\s*${buildingCode})*)$`, "i");

export function formatDisbursementPurpose(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "—" || /^مبنى(?:\s|$)/.test(text)) return text;
  return buildingGroup.test(text) ? `مبنى ${text.toUpperCase()}` : text;
}

export function splitBuildingPurposeForPdf(value: unknown) {
  const formatted = formatDisbursementPurpose(value);
  const match = formatted.match(buildingGroupAtEnd);
  return match && /[\u0600-\u06FF]/.test(match[1]) ? { arabic: match[1], latin: match[2] } : null;
}

export function splitMixedArabicLatinForPdf(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(/([A-Za-z0-9][A-Za-z0-9\s&,+/._()\-]*)$/);
  if (!match) return null;
  const arabic = text.slice(0, text.length - match[1].length).trim();
  const latin = match[1].trim();
  return arabic && /[\u0600-\u06FF]/.test(arabic) ? { arabic, latin } : /^[A-Za-z0-9][A-Za-z0-9\s&,+/._()\-]*$/.test(text) ? { arabic: "", latin } : null;
}
