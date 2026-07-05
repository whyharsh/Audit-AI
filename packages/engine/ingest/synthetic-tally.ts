import { XMLParser } from "fast-xml-parser";

import { moneyPaise } from "../types/money.js";
import type {
  AccountKind,
  EditLogEventKind,
  VoucherKind
} from "../types/transaction-graph.js";
import type {
  ClientId,
  EngagementId,
  FirmId,
  FinancialYear,
  IsoDate,
  IsoTimestamp,
  MoneyPaise,
  TimezoneName
} from "../types/primitives.js";

export interface SyntheticEngagement {
  readonly firmId: FirmId;
  readonly clientId: ClientId;
  readonly engagementId: EngagementId;
  readonly clientLegalName: string;
  readonly financialYear: FinancialYear;
  readonly materialityPaise: MoneyPaise;
}

export interface SyntheticFixtureManifest {
  readonly fixtureId: string;
  readonly fixtureName: string;
  readonly engagement: SyntheticEngagement;
  readonly expectedExceptionCount: number;
}

export interface SyntheticLedger {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
}

export interface SyntheticParty {
  readonly id: string;
  readonly ledgerGuid: string;
  readonly name: string;
  readonly gstin?: string;
  readonly pan?: string;
}

export interface SyntheticVoucherLine {
  readonly lineNumber: number;
  readonly accountGuid: string;
  readonly debitPaise: MoneyPaise;
  readonly creditPaise: MoneyPaise;
}

export interface SyntheticVoucher {
  readonly id: string;
  readonly voucherNumber: string;
  readonly voucherKind: VoucherKind;
  readonly voucherDate: IsoDate;
  readonly enteredAt: IsoTimestamp;
  readonly totalAmountPaise: MoneyPaise;
  readonly lines: readonly SyntheticVoucherLine[];
  readonly partyGuid?: string;
  readonly documentRef?: string;
  readonly narration?: string;
}

export interface SyntheticEditLogEvent {
  readonly id: string;
  readonly eventKind: EditLogEventKind;
  readonly occurredAt: IsoTimestamp;
  readonly userName?: string;
  readonly voucherGuid?: string;
  readonly fieldName?: string;
  readonly beforeValue?: string;
  readonly afterValue?: string;
}

export interface SyntheticDocumentSourceLocation {
  readonly kind: string;
  readonly page?: number;
  readonly bbox?: readonly [number, number, number, number];
}

export interface SyntheticSourceDocument {
  readonly id: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly documentDate: IsoDate;
  readonly partyGuid?: string;
  readonly voucherGuids: readonly string[];
  readonly amountPaise: MoneyPaise;
  readonly artifactName: string;
  readonly sourceLocation?: SyntheticDocumentSourceLocation;
}

export interface SyntheticDataset {
  readonly fixtureId: string;
  readonly fixtureName: string;
  readonly engagement: SyntheticEngagement;
  readonly ledgers: readonly SyntheticLedger[];
  readonly parties: readonly SyntheticParty[];
  readonly vouchers: readonly SyntheticVoucher[];
  readonly editLogEvents: readonly SyntheticEditLogEvent[];
  readonly sourceDocuments: readonly SyntheticSourceDocument[];
}

export interface SyntheticDatasetInput {
  readonly manifestJson: string;
  readonly tallyXml: string;
  readonly editLogJson: string;
  readonly sourceDocumentsJson: string;
}

export function parseSyntheticDataset(
  input: SyntheticDatasetInput
): SyntheticDataset {
  const manifest = parseSyntheticFixtureManifest(input.manifestJson);
  const daybook = parseSyntheticTallyDaybook(input.tallyXml);
  const editLogEvents = parseSyntheticEditLog(input.editLogJson);
  const sourceDocuments = parseSyntheticSourceDocuments(
    input.sourceDocumentsJson
  );

  return {
    fixtureId: manifest.fixtureId,
    fixtureName: manifest.fixtureName,
    engagement: manifest.engagement,
    ledgers: daybook.ledgers,
    parties: daybook.parties,
    vouchers: daybook.vouchers,
    editLogEvents,
    sourceDocuments
  };
}

export function parseSyntheticFixtureManifest(
  manifestJson: string
): SyntheticFixtureManifest {
  const root = asRecord(JSON.parse(manifestJson), "fixture manifest");
  const engagement = asRecord(root["engagement"], "engagement");
  const financialYear = asRecord(
    engagement["financialYear"],
    "engagement.financialYear"
  );

  return {
    fixtureId: asString(root["fixtureId"], "fixtureId"),
    fixtureName: asString(root["fixtureName"], "fixtureName"),
    expectedExceptionCount: asNumber(
      root["expectedExceptionCount"],
      "expectedExceptionCount"
    ),
    engagement: {
      firmId: asString(engagement["firmId"], "engagement.firmId") as FirmId,
      clientId: asString(
        engagement["clientId"],
        "engagement.clientId"
      ) as ClientId,
      engagementId: asString(
        engagement["engagementId"],
        "engagement.engagementId"
      ) as EngagementId,
      clientLegalName: asString(
        engagement["clientLegalName"],
        "engagement.clientLegalName"
      ),
      financialYear: {
        startsOn: asString(
          financialYear["startsOn"],
          "financialYear.startsOn"
        ) as IsoDate,
        endsOn: asString(
          financialYear["endsOn"],
          "financialYear.endsOn"
        ) as IsoDate,
        timezone: asString(
          financialYear["timezone"],
          "financialYear.timezone"
        ) as TimezoneName
      },
      materialityPaise: moneyPaise(
        asNumber(engagement["materialityPaise"], "materialityPaise")
      )
    }
  };
}

export function parseSyntheticTallyDaybook(tallyXml: string): {
  readonly ledgers: readonly SyntheticLedger[];
  readonly parties: readonly SyntheticParty[];
  readonly vouchers: readonly SyntheticVoucher[];
} {
  const parsed = asRecord(tallyParser.parse(tallyXml), "tally XML");
  const root = asRecord(
    parsed["AUDIT_EVIDENCE_SYNTHETIC_TALLY"],
    "AUDIT_EVIDENCE_SYNTHETIC_TALLY"
  );
  const ledgersRoot = asRecord(root["LEDGERS"], "LEDGERS");
  const partiesRoot = asRecord(root["PARTIES"], "PARTIES");
  const vouchersRoot = asRecord(root["VOUCHERS"], "VOUCHERS");

  const ledgers = asArray(ledgersRoot["LEDGER"], "LEDGER").map(
    (item): SyntheticLedger => {
      const ledger = asRecord(item, "LEDGER");
      return {
        id: asString(ledger["guid"], "LEDGER.guid"),
        name: asString(ledger["NAME"], "LEDGER.NAME"),
        kind: asAccountKind(asString(ledger["KIND"], "LEDGER.KIND"))
      };
    }
  );

  const parties = asArray(partiesRoot["PARTY"], "PARTY").map(
    (item): SyntheticParty => {
      const party = asRecord(item, "PARTY");
      const output: SyntheticParty = {
        id: asString(party["guid"], "PARTY.guid"),
        ledgerGuid: asString(party["ledgerGuid"], "PARTY.ledgerGuid"),
        name: asString(party["NAME"], "PARTY.NAME")
      };
      return withOptionalFields(output, {
        gstin: asOptionalString(party["GSTIN"], "PARTY.GSTIN"),
        pan: asOptionalString(party["PAN"], "PARTY.PAN")
      });
    }
  );

  const vouchers = asArray(vouchersRoot["VOUCHER"], "VOUCHER").map(
    (item): SyntheticVoucher => {
      const voucher = asRecord(item, "VOUCHER");
      const lines = asArray(voucher["LINE"], "VOUCHER.LINE").map(
        (lineItem, index): SyntheticVoucherLine => {
          const line = asRecord(lineItem, "VOUCHER.LINE");
          return {
            lineNumber: index + 1,
            accountGuid: asString(line["accountGuid"], "LINE.accountGuid"),
            debitPaise: parsePaiseString(line["debitPaise"], "LINE.debitPaise"),
            creditPaise: parsePaiseString(
              line["creditPaise"],
              "LINE.creditPaise"
            )
          };
        }
      );
      const output: SyntheticVoucher = {
        id: asString(voucher["guid"], "VOUCHER.guid"),
        voucherNumber: asString(voucher["number"], "VOUCHER.number"),
        voucherKind: asVoucherKind(asString(voucher["type"], "VOUCHER.type")),
        voucherDate: asString(voucher["date"], "VOUCHER.date") as IsoDate,
        enteredAt: asString(
          voucher["enteredAt"],
          "VOUCHER.enteredAt"
        ) as IsoTimestamp,
        totalAmountPaise: parsePaiseString(
          voucher["totalAmountPaise"],
          "VOUCHER.totalAmountPaise"
        ),
        lines
      };
      return withOptionalFields(output, {
        partyGuid: asOptionalString(voucher["partyGuid"], "VOUCHER.partyGuid"),
        documentRef: asOptionalString(
          voucher["documentRef"],
          "VOUCHER.documentRef"
        ),
        narration: asOptionalString(voucher["NARRATION"], "VOUCHER.NARRATION")
      });
    }
  );

  return {
    ledgers,
    parties,
    vouchers
  };
}

export function parseSyntheticEditLog(
  editLogJson: string
): readonly SyntheticEditLogEvent[] {
  const root = asRecord(JSON.parse(editLogJson), "edit log");
  return asArray(root["events"], "events").map((item): SyntheticEditLogEvent => {
    const event = asRecord(item, "event");
    const output: SyntheticEditLogEvent = {
      id: asString(event["eventId"], "event.eventId"),
      eventKind: asEditLogEventKind(
        asString(event["eventKind"], "event.eventKind")
      ),
      occurredAt: asString(
        event["occurredAt"],
        "event.occurredAt"
      ) as IsoTimestamp
    };

    return withOptionalFields(output, {
      userName: asOptionalString(event["userName"], "event.userName"),
      voucherGuid: asOptionalString(event["voucherGuid"], "event.voucherGuid"),
      fieldName: asOptionalString(event["fieldName"], "event.fieldName"),
      beforeValue: asOptionalString(event["beforeValue"], "event.beforeValue"),
      afterValue: asOptionalString(event["afterValue"], "event.afterValue")
    });
  });
}

export function parseSyntheticSourceDocuments(
  sourceDocumentsJson: string
): readonly SyntheticSourceDocument[] {
  const root = asRecord(JSON.parse(sourceDocumentsJson), "source documents");
  return asArray(root["documents"], "documents").map(
    (item): SyntheticSourceDocument => {
      const document = asRecord(item, "document");
      const output: SyntheticSourceDocument = {
        id: asString(document["documentId"], "document.documentId"),
        documentType: asString(
          document["documentType"],
          "document.documentType"
        ),
        documentNumber: asString(
          document["documentNumber"],
          "document.documentNumber"
        ),
        documentDate: asString(
          document["documentDate"],
          "document.documentDate"
        ) as IsoDate,
        voucherGuids: asArray(
          document["voucherGuids"],
          "document.voucherGuids"
        ).map((value) => asString(value, "document.voucherGuids[]")),
        amountPaise: moneyPaise(
          asNumber(document["amountPaise"], "document.amountPaise")
        ),
        artifactName: asString(
          document["artifactName"],
          "document.artifactName"
        )
      };

      return withOptionalFields(output, {
        partyGuid: asOptionalString(document["partyGuid"], "document.partyGuid"),
        sourceLocation: parseOptionalSourceLocation(
          document["sourceLocation"],
          "document.sourceLocation"
        )
      });
    }
  );
}

const tallyParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (_name, jPath) =>
    jPath === "AUDIT_EVIDENCE_SYNTHETIC_TALLY.LEDGERS.LEDGER" ||
    jPath === "AUDIT_EVIDENCE_SYNTHETIC_TALLY.PARTIES.PARTY" ||
    jPath === "AUDIT_EVIDENCE_SYNTHETIC_TALLY.VOUCHERS.VOUCHER" ||
    jPath === "AUDIT_EVIDENCE_SYNTHETIC_TALLY.VOUCHERS.VOUCHER.LINE"
});

function parseOptionalSourceLocation(
  value: unknown,
  label: string
): SyntheticDocumentSourceLocation | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asRecord(value, label);
  const bboxValue = record["bbox"];
  const output: SyntheticDocumentSourceLocation = {
    kind: asString(record["kind"], `${label}.kind`)
  };

  return withOptionalFields(output, {
    page:
      record["page"] === undefined
        ? undefined
        : asNumber(record["page"], `${label}.page`),
    bbox:
      bboxValue === undefined
        ? undefined
        : asBbox(bboxValue, `${label}.bbox`)
  });
}

function asBbox(
  value: unknown,
  label: string
): readonly [number, number, number, number] {
  const array = asArray(value, label);
  if (array.length !== 4) {
    throw new Error(`${label} must have four numbers`);
  }

  const first = asNumber(array[0], `${label}[0]`);
  const second = asNumber(array[1], `${label}[1]`);
  const third = asNumber(array[2], `${label}[2]`);
  const fourth = asNumber(array[3], `${label}[3]`);
  return [first, second, third, fourth];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
}

function asOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return asString(value, label);
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }

  return value;
}

function parsePaiseString(value: unknown, label: string): MoneyPaise {
  const text = asString(value, label).trim();
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`${label} must be an integer paise string`);
  }

  const asBigInt = BigInt(text);
  const asNumberValue = Number(asBigInt);
  if (
    !Number.isSafeInteger(asNumberValue) ||
    BigInt(asNumberValue) !== asBigInt
  ) {
    throw new Error(`${label} exceeds safe integer range`);
  }

  return moneyPaise(asNumberValue);
}

function withOptionalFields<TBase extends object, TOptional extends object>(
  base: TBase,
  optional: TOptional
): TBase & Partial<TOptional> {
  const output = { ...base } as Record<string, unknown>;

  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }

  return output as TBase & Partial<TOptional>;
}

function asAccountKind(value: string): AccountKind {
  switch (value) {
    case "asset":
    case "liability":
    case "equity":
    case "income":
    case "expense":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function asVoucherKind(value: string): VoucherKind {
  switch (value) {
    case "payment":
    case "receipt":
    case "journal":
    case "sales":
    case "purchase":
    case "contra":
    case "debit-note":
    case "credit-note":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function asEditLogEventKind(value: string): EditLogEventKind {
  switch (value) {
    case "feature-enabled":
    case "feature-disabled":
    case "voucher-created":
    case "voucher-updated":
    case "voucher-deleted":
    case "master-updated":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}
