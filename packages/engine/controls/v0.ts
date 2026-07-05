import {
  canonicalJsonInteger,
  toCanonicalJsonValue
} from "../types/canonical-json.js";
import { hashCanonicalJson } from "../types/hash.js";
import type {
  CanonicalJsonValue,
  FindingId
} from "../types/primitives.js";
import type {
  FindingSeverity,
  FindingStatus
} from "../types/controls.js";
import type {
  SyntheticDataset,
  SyntheticEditLogEvent,
  SyntheticParty,
  SyntheticSourceDocument,
  SyntheticVoucher
} from "../ingest/synthetic-tally.js";

export interface V0ControlFinding {
  readonly id: FindingId;
  readonly controlId: string;
  readonly status: FindingStatus;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly detail: string;
  readonly sourceRefs: readonly string[];
  readonly data: CanonicalJsonValue;
}

interface FindingInput {
  readonly controlId: string;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly detail: string;
  readonly sourceRefs: readonly string[];
  readonly data: unknown;
}

export function runV0Controls(
  dataset: SyntheticDataset
): readonly V0ControlFinding[] {
  return [
    ...runEditLogDisabledPeriod(dataset),
    ...runEditLogGap(dataset),
    ...runDuplicatePayment(dataset),
    ...runCutoffYearend(dataset),
    ...runManualJournalRisk(dataset)
  ];
}

function runEditLogDisabledPeriod(
  dataset: SyntheticDataset
): readonly V0ControlFinding[] {
  const events = sortedEvents(dataset.editLogEvents);
  const findings: V0ControlFinding[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event?.eventKind !== "feature-disabled") {
      continue;
    }

    const enabledEvent = events
      .slice(index + 1)
      .find((candidate) => candidate.eventKind === "feature-enabled");
    if (enabledEvent === undefined) {
      continue;
    }

    const affectedVouchers = dataset.vouchers.filter(
      (voucher) =>
        voucher.enteredAt >= event.occurredAt &&
        voucher.enteredAt <= enabledEvent.occurredAt
    );
    if (affectedVouchers.length === 0) {
      continue;
    }

    const voucherNumbers = affectedVouchers.map(
      (voucher) => voucher.voucherNumber
    );

    findings.push(
      makeFinding({
        controlId: "editlog-disabled-period",
        severity: "critical",
        title: "Edit log disabled during the financial year",
        detail: `Audit trail was disabled from ${event.occurredAt} to ${enabledEvent.occurredAt}. Vouchers ${joinWithAnd(voucherNumbers)} were entered during that interval.`,
        sourceRefs: [
          event.id,
          enabledEvent.id,
          ...affectedVouchers.map((voucher) => voucher.id)
        ],
        data: {
          disabledFrom: event.occurredAt,
          disabledUntil: enabledEvent.occurredAt,
          voucherNumbers
        }
      })
    );
  }

  return findings;
}

function runEditLogGap(dataset: SyntheticDataset): readonly V0ControlFinding[] {
  const events = sortedEvents(dataset.editLogEvents);
  const loggedVoucherGuids = new Set(
    events
      .map((event) => event.voucherGuid)
      .filter((voucherGuid): voucherGuid is string => voucherGuid !== undefined)
  );
  const findings: V0ControlFinding[] = [];

  for (let index = 0; index < events.length - 1; index += 1) {
    const left = events[index];
    const right = events[index + 1];
    if (left === undefined || right === undefined) {
      continue;
    }

    if (
      left.eventKind === "feature-disabled" ||
      right.eventKind === "feature-enabled"
    ) {
      continue;
    }

    if (daysBetweenTimestamps(left.occurredAt, right.occurredAt) < 7) {
      continue;
    }

    const unloggedVouchers = dataset.vouchers.filter(
      (voucher) =>
        voucher.enteredAt > left.occurredAt &&
        voucher.enteredAt < right.occurredAt &&
        !loggedVoucherGuids.has(voucher.id)
    );
    if (unloggedVouchers.length === 0) {
      continue;
    }

    const voucherNumbers = unloggedVouchers.map(
      (voucher) => voucher.voucherNumber
    );
    findings.push(
      makeFinding({
        controlId: "editlog-gap",
        severity: "high",
        title: "Posting activity found during edit-log silence gap",
        detail: `No edit-log events exist between ${left.occurredAt} and ${right.occurredAt}, but ${countWord(unloggedVouchers.length)} vouchers were entered in that period.`,
        sourceRefs: unloggedVouchers.map((voucher) => voucher.id),
        data: {
          gapStartsAfter: left.occurredAt,
          gapEndsBefore: right.occurredAt,
          voucherNumbers
        }
      })
    );
  }

  return findings;
}

function runDuplicatePayment(
  dataset: SyntheticDataset
): readonly V0ControlFinding[] {
  const partiesById = mapById(dataset.parties);
  const documentsById = mapById(dataset.sourceDocuments);
  const groups = new Map<string, SyntheticVoucher[]>();

  for (const voucher of dataset.vouchers) {
    if (
      voucher.voucherKind !== "payment" ||
      voucher.partyGuid === undefined ||
      voucher.documentRef === undefined
    ) {
      continue;
    }

    const key = [
      voucher.partyGuid,
      voucher.documentRef,
      String(voucher.totalAmountPaise)
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(voucher);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group): SyntheticVoucher[] =>
      [...group].sort(compareVoucherDateThenNumber)
    )
    .filter((group) => dateDistanceDays(group) <= 7)
    .map((group) => {
      const first = requireFirst(group, "duplicate payment group");
      const party = requireMapValue(
        partiesById,
        first.partyGuid,
        "duplicate payment party"
      );
      const document = requireMapValue(
        documentsById,
        first.documentRef,
        "duplicate payment document"
      );
      const distanceDays = dateDistanceDays(group);
      const paymentVoucherNumbers = group.map(
        (voucher) => voucher.voucherNumber
      );

      return makeFinding({
        controlId: "duplicate-payment",
        severity: "medium",
        title: `Possible duplicate payment to ${party.name}`,
        detail: `Payment vouchers ${joinWithAnd(paymentVoucherNumbers)} both pay ${party.name} ${formatInr(first.totalAmountPaise)} against bill ${document.documentNumber} within ${countWord(distanceDays)} days.`,
        sourceRefs: [
          ...group.map((voucher) => voucher.id),
          document.id
        ],
        data: {
          partyName: party.name,
          amountPaise: canonicalJsonInteger(first.totalAmountPaise),
          paymentVoucherNumbers,
          documentNumber: document.documentNumber,
          dateDistanceDays: canonicalJsonInteger(distanceDays)
        }
      });
    });
}

function runCutoffYearend(
  dataset: SyntheticDataset
): readonly V0ControlFinding[] {
  const documentsById = mapById(dataset.sourceDocuments);
  const findings: V0ControlFinding[] = [];
  const yearEnd = dataset.engagement.financialYear.endsOn;

  for (const voucher of dataset.vouchers) {
    if (voucher.documentRef === undefined) {
      continue;
    }

    const document = documentsById.get(voucher.documentRef);
    if (document === undefined) {
      continue;
    }

    if (
      voucher.voucherKind === "purchase" &&
      voucher.voucherDate <= yearEnd &&
      document.documentDate > yearEnd
    ) {
      findings.push(makePurchaseCutoffFinding(voucher, document));
    }

    if (
      voucher.voucherKind === "sales" &&
      voucher.voucherDate > yearEnd &&
      document.documentDate <= yearEnd
    ) {
      findings.push(makeSalesCutoffFinding(voucher, document));
    }
  }

  return findings;
}

function makePurchaseCutoffFinding(
  voucher: SyntheticVoucher,
  document: SyntheticSourceDocument
): V0ControlFinding {
  const labels =
    document.documentType === "goods-receipt-note"
      ? {
          title: "Purchase recorded before year-end with post-year-end goods receipt",
          documentLabel: "goods receipt"
        }
      : {
          title: "Purchase recorded before year-end with post-year-end supplier bill",
          documentLabel: "supplier bill"
        };

  return makeFinding({
    controlId: "cutoff-yearend",
    severity: "high",
    title: labels.title,
    detail: `Voucher ${voucher.voucherNumber} is dated ${voucher.voucherDate}, but ${labels.documentLabel} ${document.documentNumber} is dated ${document.documentDate}.`,
    sourceRefs: [voucher.id, document.id],
    data: {
      voucherNumber: voucher.voucherNumber,
      voucherDate: voucher.voucherDate,
      documentNumber: document.documentNumber,
      documentDate: document.documentDate,
      amountPaise: canonicalJsonInteger(voucher.totalAmountPaise)
    }
  });
}

function makeSalesCutoffFinding(
  voucher: SyntheticVoucher,
  document: SyntheticSourceDocument
): V0ControlFinding {
  return makeFinding({
    controlId: "cutoff-yearend",
    severity: "medium",
    title: "Sale recorded after year-end with pre-year-end dispatch",
    detail: `Voucher ${voucher.voucherNumber} is dated ${voucher.voucherDate}, but dispatch note ${document.documentNumber} is dated ${document.documentDate}.`,
    sourceRefs: [voucher.id, document.id],
    data: {
      voucherNumber: voucher.voucherNumber,
      voucherDate: voucher.voucherDate,
      documentNumber: document.documentNumber,
      documentDate: document.documentDate,
      amountPaise: canonicalJsonInteger(voucher.totalAmountPaise)
    }
  });
}

function runManualJournalRisk(
  dataset: SyntheticDataset
): readonly V0ControlFinding[] {
  const ledgersById = mapById(dataset.ledgers);
  const sensitiveLedgerNames = [
    "Suspense Account",
    "Prior Period Expense",
    "Revenue Adjustment"
  ];
  const riskyJournals = dataset.vouchers
    .filter(
      (voucher) =>
        voucher.voucherKind === "journal" &&
        voucher.voucherDate === dataset.engagement.financialYear.endsOn &&
        Number(voucher.totalAmountPaise) % 5000000 === 0 &&
        voucher.lines.some((line) => {
          const ledger = ledgersById.get(line.accountGuid);
          return (
            ledger !== undefined && sensitiveLedgerNames.includes(ledger.name)
          );
        })
    )
    .sort(compareVoucherDateThenNumber);

  if (riskyJournals.length < 3) {
    return [];
  }

  const presentSensitiveLedgers = sensitiveLedgerNames.filter((name) =>
    riskyJournals.some((voucher) =>
      voucher.lines.some(
        (line) => ledgersById.get(line.accountGuid)?.name === name
      )
    )
  );
  const totalClusterAmountPaise = riskyJournals.reduce(
    (sum, voucher) => sum + Number(voucher.totalAmountPaise),
    0
  );
  const voucherNumbers = riskyJournals.map((voucher) => voucher.voucherNumber);

  return [
    makeFinding({
      controlId: "manual-journal-risk",
      severity: "high",
      title: "Cluster of manual round-sum journals posted at year-end",
      detail: `Manual journals ${joinWithAnd(voucherNumbers)} were posted on ${dataset.engagement.financialYear.endsOn} with round amounts and sensitive ledger heads.`,
      sourceRefs: riskyJournals.map((voucher) => voucher.id),
      data: {
        voucherNumbers,
        voucherDate: dataset.engagement.financialYear.endsOn,
        totalClusterAmountPaise: canonicalJsonInteger(totalClusterAmountPaise),
        sensitiveLedgers: presentSensitiveLedgers
      }
    })
  ];
}

function makeFinding(input: FindingInput): V0ControlFinding {
  const data = toCanonicalJsonValue(input.data);
  const hashInput = toCanonicalJsonValue({
    controlId: input.controlId,
    data,
    detail: input.detail,
    severity: input.severity,
    sourceRefs: input.sourceRefs,
    status: "EXCEPTION",
    title: input.title
  });

  return {
    id: hashCanonicalJson(hashInput) as unknown as FindingId,
    controlId: input.controlId,
    status: "EXCEPTION",
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    sourceRefs: input.sourceRefs,
    data
  };
}

function sortedEvents(
  events: readonly SyntheticEditLogEvent[]
): readonly SyntheticEditLogEvent[] {
  return [...events].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt)
  );
}

function compareVoucherDateThenNumber(
  left: SyntheticVoucher,
  right: SyntheticVoucher
): number {
  const dateCompare = left.voucherDate.localeCompare(right.voucherDate);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  return left.voucherNumber.localeCompare(right.voucherNumber);
}

function daysBetweenTimestamps(left: string, right: string): number {
  return Math.floor((Date.parse(right) - Date.parse(left)) / 86400000);
}

function dateDistanceDays(vouchers: readonly SyntheticVoucher[]): number {
  const dates = vouchers.map((voucher) => voucher.voucherDate).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === undefined || last === undefined) {
    return 0;
  }

  return daysBetweenDates(first, last);
}

function daysBetweenDates(left: string, right: string): number {
  return Math.round(
    (Date.parse(`${right}T00:00:00Z`) -
      Date.parse(`${left}T00:00:00Z`)) /
      86400000
  );
}

function mapById<TItem extends { readonly id: string }>(
  items: readonly TItem[]
): Map<string, TItem> {
  return new Map(items.map((item) => [item.id, item]));
}

function requireFirst<TItem>(
  items: readonly TItem[],
  label: string
): TItem {
  const first = items[0];
  if (first === undefined) {
    throw new Error(`${label} is empty`);
  }

  return first;
}

function requireMapValue<TItem>(
  map: ReadonlyMap<string, TItem>,
  key: string | undefined,
  label: string
): TItem {
  if (key === undefined) {
    throw new Error(`${label} is missing a key`);
  }

  const item = map.get(key);
  if (item === undefined) {
    throw new Error(`${label} was not found: ${key}`);
  }

  return item;
}

function formatInr(amountPaise: number): string {
  const rupees = Math.trunc(amountPaise / 100);
  const paise = Math.abs(amountPaise % 100);
  const groupedRupees = groupIndianDigits(String(Math.abs(rupees)));
  const sign = amountPaise < 0 ? "-" : "";
  if (paise === 0) {
    return `INR ${sign}${groupedRupees}`;
  }

  return `INR ${sign}${groupedRupees}.${String(paise).padStart(2, "0")}`;
}

function groupIndianDigits(value: string): string {
  if (value.length <= 3) {
    return value;
  }

  const lastThree = value.slice(-3);
  const prefix = value.slice(0, -3);
  const groups: string[] = [];
  for (let index = prefix.length; index > 0; index -= 2) {
    groups.unshift(prefix.slice(Math.max(0, index - 2), index));
  }

  return `${groups.join(",")},${lastThree}`;
}

function joinWithAnd(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function countWord(value: number): string {
  switch (value) {
    case 1:
      return "one";
    case 2:
      return "two";
    case 3:
      return "three";
    case 4:
      return "four";
    case 5:
      return "five";
    default:
      return String(value);
  }
}
