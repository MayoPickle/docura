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

export type DocType =
  | "credit_card"
  | "passport"
  | "visa"
  | "diploma"
  | "id_card"
  | "driver_license"
  | "other";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  credit_card: "Credit Card",
  passport: "Passport",
  visa: "Visa",
  diploma: "Diploma",
  id_card: "ID Card",
  driver_license: "Driver License",
  other: "Other",
};

export const DOC_TYPE_ICONS: Record<DocType, string> = {
  credit_card: "CreditCardOutlined",
  passport: "BookOutlined",
  visa: "GlobalOutlined",
  diploma: "TrophyOutlined",
  id_card: "IdcardOutlined",
  driver_license: "CarOutlined",
  other: "FileOutlined",
};

export const DOC_TYPE_FIELDS: Record<DocType, { key: string; label: string }[]> = {
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
  other: [
    { key: "description", label: "Description" },
  ],
};
