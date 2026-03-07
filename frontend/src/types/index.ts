export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface DocumentFile {
  id: number;
  document_id: number;
  filename: string;
  content_type: string;
  uploaded_at: string;
}

export interface Document {
  id: number;
  user_id: number;
  title: string;
  doc_type: DocType;
  doc_type_icon_key?: string | null;
  doc_type_icon_bg?: string | null;
  doc_type_icon_fg?: string | null;
  fields_json: string;
  notes: string;
  created_at: string;
  updated_at: string;
  files: DocumentFile[];
}

export interface DocumentListItem {
  id: number;
  user_id: number;
  title: string;
  doc_type: DocType;
  doc_type_icon_key?: string | null;
  doc_type_icon_bg?: string | null;
  doc_type_icon_fg?: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  file_count: number;
}

export interface DocumentSummary {
  total: number;
  by_type: Record<string, number>;
}

export interface ScanResult {
  doc_type: DocType;
  title: string;
  fields: Record<string, string>;
  confidence: number;
  method: string;
}

export type KnownDocType =
  | "credit_card"
  | "passport"
  | "visa"
  | "diploma"
  | "id_card"
  | "driver_license"
  | "i20"
  | "i797"
  | "other";

export type DocType = string;

export const DOC_TYPE_LABELS: Record<KnownDocType, string> = {
  credit_card: "Credit Card",
  passport: "Passport",
  visa: "Visa",
  diploma: "Diploma",
  id_card: "ID Card",
  driver_license: "Driver License",
  i20: "I-20",
  i797: "I-797",
  other: "Other",
};

export const DOC_TYPE_ICONS: Record<KnownDocType, string> = {
  credit_card: "CreditCardOutlined",
  passport: "BookOutlined",
  visa: "GlobalOutlined",
  diploma: "TrophyOutlined",
  id_card: "IdcardOutlined",
  driver_license: "CarOutlined",
  i20: "FileTextOutlined",
  i797: "ProfileOutlined",
  other: "FileOutlined",
};

export const DOC_TYPE_FIELDS: Record<KnownDocType, { key: string; label: string }[]> = {
  credit_card: [
    { key: "card_number", label: "Card Number" },
    { key: "cardholder_name", label: "Cardholder Name" },
    { key: "expiry_date", label: "Expiry Date" },
    { key: "security_code", label: "Security Code" },
    { key: "bank", label: "Bank" },
    { key: "card_type", label: "Card Type" },
  ],
  passport: [
    { key: "passport_number", label: "Passport Number" },
    { key: "full_name", label: "Full Name" },
    { key: "nationality", label: "Nationality" },
    { key: "date_of_birth", label: "Date of Birth" },
    { key: "sex", label: "Sex" },
    { key: "issue_date", label: "Issue Date" },
    { key: "expiry_date", label: "Expiry Date" },
    { key: "place_of_birth", label: "Place of Birth" },
  ],
  visa: [
    { key: "visa_number", label: "Visa Number" },
    { key: "full_name", label: "Full Name" },
    { key: "country", label: "Country" },
    { key: "visa_type", label: "Visa Type" },
    { key: "issue_date", label: "Issue Date" },
    { key: "expiry_date", label: "Expiry Date" },
    { key: "entries", label: "Entries" },
  ],
  diploma: [
    { key: "institution", label: "Institution" },
    { key: "degree", label: "Degree" },
    { key: "major", label: "Major" },
    { key: "full_name", label: "Full Name" },
    { key: "graduation_date", label: "Graduation Date" },
  ],
  id_card: [
    { key: "id_number", label: "ID Number" },
    { key: "full_name", label: "Full Name" },
    { key: "date_of_birth", label: "Date of Birth" },
    { key: "sex", label: "Sex" },
    { key: "address", label: "Address" },
    { key: "issue_date", label: "Issue Date" },
    { key: "expiry_date", label: "Expiry Date" },
  ],
  driver_license: [
    { key: "license_number", label: "License Number" },
    { key: "full_name", label: "Full Name" },
    { key: "date_of_birth", label: "Date of Birth" },
    { key: "address", label: "Address" },
    { key: "class", label: "Class" },
    { key: "issue_date", label: "Issue Date" },
    { key: "expiry_date", label: "Expiry Date" },
  ],
  i20: [
    { key: "sevis_id", label: "SEVIS ID" },
    { key: "school_name", label: "School Name" },
    { key: "full_name", label: "Full Name" },
    { key: "program", label: "Program" },
    { key: "start_date", label: "Start Date" },
    { key: "end_date", label: "End Date" },
  ],
  i797: [
    { key: "receipt_number", label: "Receipt Number" },
    { key: "notice_type", label: "Notice Type" },
    { key: "petitioner", label: "Petitioner" },
    { key: "beneficiary", label: "Beneficiary" },
    { key: "received_date", label: "Received Date" },
    { key: "notice_date", label: "Notice Date" },
    { key: "start_date", label: "Start Date" },
    { key: "end_date", label: "End Date" },
    { key: "class_requested", label: "Class Requested" },
  ],
  other: [
    { key: "description", label: "Description" },
  ],
};

export function getDocTypeLabel(docType: string): string {
  const known = DOC_TYPE_LABELS[docType as KnownDocType];
  if (known) {
    return known;
  }
  return docType
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase()) || "Other";
}

export function toFieldLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
