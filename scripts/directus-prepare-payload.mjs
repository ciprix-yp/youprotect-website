#!/usr/bin/env node
import { promises as fsp } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join(
  ROOT,
  "tmp",
  "directus-catalog",
  "input",
  "products.csv"
);
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "tmp",
  "directus-catalog",
  "output",
  "directus-products.json"
);
const DEFAULT_CSV_OUTPUT = path.join(
  ROOT,
  "tmp",
  "directus-catalog",
  "output",
  "directus-products-import.csv"
);
const DEFAULT_TEMPLATE = path.join(
  ROOT,
  "tmp",
  "directus-catalog",
  "input",
  "products.csv"
);

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    csvOutput: DEFAULT_CSV_OUTPUT,
    copy: false,
    strict: false,
    initTemplate: false,
    noCsv: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" && argv[i + 1]) {
      options.input = path.resolve(ROOT, argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--output" && argv[i + 1]) {
      options.output = path.resolve(ROOT, argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--csv-output" && argv[i + 1]) {
      options.csvOutput = path.resolve(ROOT, argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--copy") {
      options.copy = true;
      continue;
    }
    if (token === "--strict") {
      options.strict = true;
      continue;
    }
    if (token === "--init-template") {
      options.initTemplate = true;
      continue;
    }
    if (token === "--no-csv") {
      options.noCsv = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/directus-prepare-payload.mjs [--input <file>] [--output <file>] [--csv-output <file>] [--copy] [--strict] [--no-csv]
  node scripts/directus-prepare-payload.mjs --init-template

Supported input formats:
  - .csv (recommended for copy from Sheets/Excel)
  - .json (array of product objects)

CSV headers expected:
  id,name,slug,description,base_price,category_name,is_featured,supplier_sku,cover_image_url,status,size_range,color_options,materials,certifications,seasonality,key_benefits
`);
}

async function ensureDir(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const normalized = String(item).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  if (["1", "true", "yes", "y", "da", "enabled", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "nu", "disabled", "off"].includes(raw)) return false;
  return false;
}

function normalizeSlug(raw, fallbackIndex) {
  const source = String(raw ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `produs-${fallbackIndex + 1}`;
}

function parsePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStatus(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "published" || raw === "draft" || raw === "archived") return raw;
  return "draft";
}

function parseSeasonality(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "vara" || raw === "iarna" || raw === "all-season") return raw;
  return null;
}

function parseList(value) {
  if (Array.isArray(value)) return dedupe(value);
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return dedupe(parsed);
    } catch {
      // Fall back to separator parsing.
    }
  }

  const separator = raw.includes("|") ? "|" : ",";
  return dedupe(raw.split(separator).map((item) => item.trim()));
}

function normalizeHex(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const candidate = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(candidate) ? candidate.toUpperCase() : null;
}

function parseColorOptions(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const name = String(item.name ?? "").trim();
        const hex = normalizeHex(item.hex);
        if (!name) return null;
        return { name, hex };
      })
      .filter(Boolean);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return [];

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      return parseColorOptions(parsed);
    } catch {
      // Fall back to manual parsing below.
    }
  }

  const tokens = raw.split("|").map((item) => item.trim()).filter(Boolean);
  const out = [];

  for (const token of tokens) {
    const [nameRaw, hexRaw] = token.split(":");
    const name = String(nameRaw ?? "").trim();
    const hex = normalizeHex(hexRaw);
    if (!name) continue;
    out.push({ name, hex });
  }

  return out;
}

function isValidHttpUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function splitCsvLine(line, delimiter) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(content) {
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return [];

  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const headers = splitCsvLine(headerLine, delimiter).map((h) => h.toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const rawValues = splitCsvLine(lines[i], delimiter);
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = rawValues[c] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function escapeCsvCell(value) {
  const raw = String(value ?? "");
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function toDirectusCsv(products) {
  const headers = [
    "id",
    "name",
    "slug",
    "description",
    "base_price",
    "category_name",
    "is_featured",
    "supplier_sku",
    "cover_image_url",
    "status",
    "size_range",
    "color_options",
    "materials",
    "certifications",
    "seasonality",
    "key_benefits",
  ];

  const lines = [headers.join(",")];
  for (const item of products) {
    const row = [
      item.id,
      item.name,
      item.slug,
      item.description,
      item.base_price ?? "",
      item.category_name,
      String(item.is_featured),
      item.supplier_sku,
      item.cover_image_url ?? "",
      item.status,
      JSON.stringify(item.size_range ?? []),
      JSON.stringify(item.color_options ?? []),
      JSON.stringify(item.materials ?? []),
      JSON.stringify(item.certifications ?? []),
      item.seasonality ?? "",
      JSON.stringify(item.key_benefits ?? []),
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  }

  return lines.join("\n") + "\n";
}

async function readRows(inputFile) {
  const content = await fsp.readFile(inputFile, "utf8");
  const ext = path.extname(inputFile).toLowerCase();

  if (ext === ".json") {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    throw new Error("JSON input must be an array or { items: [] }.");
  }

  if (ext === ".csv") {
    return parseCsv(content);
  }

  throw new Error("Unsupported input format. Use .csv or .json.");
}

function transformRows(rows) {
  const warnings = [];
  const errors = [];
  const slugCount = new Map();

  const out = rows.map((raw, index) => {
    const idRaw = String(raw.id ?? "").trim();
    const id =
      idRaw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idRaw)
        ? idRaw
        : randomUUID();

    if (!idRaw) {
      warnings.push(`Row ${index + 2}: missing 'id' -> generated UUID ${id}.`);
    } else if (idRaw !== id) {
      warnings.push(`Row ${index + 2}: invalid 'id' -> generated UUID ${id}.`);
    }

    const name = String(raw.name ?? "").trim();
    const baseSlug = normalizeSlug(raw.slug || name, index);

    const seen = slugCount.get(baseSlug) ?? 0;
    slugCount.set(baseSlug, seen + 1);
    const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;

    if (!name) {
      errors.push(`Row ${index + 2}: missing 'name'.`);
    }
    if (!String(raw.supplier_sku ?? "").trim()) {
      errors.push(`Row ${index + 2}: missing 'supplier_sku'.`);
    }

    const coverImageUrl = String(raw.cover_image_url ?? "").trim();
    const normalizedCover =
      coverImageUrl && isValidHttpUrl(coverImageUrl) ? coverImageUrl : null;

    if (coverImageUrl && !normalizedCover) {
      warnings.push(`Row ${index + 2}: invalid cover_image_url -> set to null.`);
    }

    const seasonality = parseSeasonality(raw.seasonality);
    if (String(raw.seasonality ?? "").trim() && !seasonality) {
      warnings.push(
        `Row ${index + 2}: invalid seasonality '${raw.seasonality}' -> set to null.`
      );
    }

    const colorOptions = parseColorOptions(raw.color_options);
    for (const color of colorOptions) {
      if (!color.hex) {
        warnings.push(
          `Row ${index + 2}: color '${color.name}' has invalid hex -> set to null.`
        );
      }
    }

    return {
      id,
      name,
      slug,
      description: String(raw.description ?? "").trim(),
      base_price: parsePrice(raw.base_price),
      category_name: String(raw.category_name ?? "").trim(),
      is_featured: parseBoolean(raw.is_featured),
      supplier_sku: String(raw.supplier_sku ?? "").trim(),
      cover_image_url: normalizedCover,
      status: parseStatus(raw.status),
      size_range: parseList(raw.size_range),
      color_options: colorOptions,
      materials: parseList(raw.materials),
      certifications: parseList(raw.certifications),
      seasonality,
      key_benefits: parseList(raw.key_benefits),
    };
  });

  return { out, warnings, errors };
}

async function writeTemplate(filePath) {
  const header =
    "id,name,slug,description,base_price,category_name,is_featured,supplier_sku,cover_image_url,status,size_range,color_options,materials,certifications,seasonality,key_benefits";
  const sample =
    ",\"Bocanci S3 TechShield\",bocanci-s3-techshield,\"Bocanci de protectie pentru santier, confort extins si aderenta ridicata.\",349.99,Incaltaminte,true,TS-S3-001,https://example.com/images/bocanci-s3-techshield.jpg,draft,\"39|40|41|42|43|44\",\"Galben HV:#E4FF00|Negru:#111111\",\"piele naturala|textil tehnic\",\"EN ISO 20345|CE\",all-season,\"Rezistenta la apa|Confort la purtare|Talpa antiderapanta\"";
  await ensureDir(filePath);
  await fsp.writeFile(filePath, `${header}\n${sample}\n`, "utf8");
}

async function copyToClipboard(value) {
  const result = spawnSync("pbcopy", { input: value });
  if (result.error || result.status !== 0) {
    throw new Error("Clipboard copy failed. Use output file instead.");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.initTemplate) {
    await writeTemplate(DEFAULT_TEMPLATE);
    console.log(`[directus] Template created at: ${DEFAULT_TEMPLATE}`);
    return;
  }

  const rows = await readRows(options.input);
  if (rows.length === 0) {
    throw new Error("Input file has no rows.");
  }

  const { out, warnings, errors } = transformRows(rows);

  if (errors.length > 0) {
    console.error("[directus] Validation errors:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    if (options.strict) {
      process.exit(1);
    }
  }

  if (warnings.length > 0) {
    console.log("[directus] Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  const payload = JSON.stringify(out, null, 2);
  await ensureDir(options.output);
  await fsp.writeFile(options.output, payload + "\n", "utf8");

  console.log(`[directus] Products transformed: ${out.length}`);
  console.log(`[directus] Output written to: ${options.output}`);

  if (!options.noCsv) {
    const csvPayload = toDirectusCsv(out);
    await ensureDir(options.csvOutput);
    await fsp.writeFile(options.csvOutput, csvPayload, "utf8");
    console.log(`[directus] CSV written to: ${options.csvOutput}`);
  }

  if (options.copy) {
    await copyToClipboard(payload);
    console.log("[directus] JSON copied to clipboard.");
  }
}

main().catch((error) => {
  console.error(`[directus] Failed: ${error.message}`);
  process.exit(1);
});
