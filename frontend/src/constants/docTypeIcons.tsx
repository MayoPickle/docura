import type { ReactNode } from "react";
import {
  BankOutlined,
  BookOutlined,
  CalendarOutlined,
  CarOutlined,
  CreditCardOutlined,
  FileOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FolderOutlined,
  GlobalOutlined,
  HomeOutlined,
  IdcardOutlined,
  MedicineBoxOutlined,
  ProfileOutlined,
  SafetyCertificateOutlined,
  TrophyOutlined,
  WalletOutlined,
} from "@ant-design/icons";

export type DocTypeIconKey =
  | "credit_card"
  | "passport"
  | "visa"
  | "diploma"
  | "id_card"
  | "driver_license"
  | "i20"
  | "i797"
  | "other"
  | "file_text"
  | "file_search"
  | "folder"
  | "safety"
  | "bank"
  | "wallet"
  | "home"
  | "medicine"
  | "calendar"
  | "profile"
  | "book"
  | "global"
  | "car"
  | "idcard"
  | "trophy";

type IconOption = {
  key: DocTypeIconKey;
  label: string;
  icon: ReactNode;
};

const ICON_MAP: Record<DocTypeIconKey, ReactNode> = {
  credit_card: <CreditCardOutlined />,
  passport: <BookOutlined />,
  visa: <GlobalOutlined />,
  diploma: <TrophyOutlined />,
  id_card: <IdcardOutlined />,
  driver_license: <CarOutlined />,
  i20: <FileTextOutlined />,
  i797: <ProfileOutlined />,
  other: <FileOutlined />,
  file_text: <FileTextOutlined />,
  file_search: <FileSearchOutlined />,
  folder: <FolderOutlined />,
  safety: <SafetyCertificateOutlined />,
  bank: <BankOutlined />,
  wallet: <WalletOutlined />,
  home: <HomeOutlined />,
  medicine: <MedicineBoxOutlined />,
  calendar: <CalendarOutlined />,
  profile: <ProfileOutlined />,
  book: <BookOutlined />,
  global: <GlobalOutlined />,
  car: <CarOutlined />,
  idcard: <IdcardOutlined />,
  trophy: <TrophyOutlined />,
};

const DEFAULT_ICON_BY_TYPE: Record<string, DocTypeIconKey> = {
  credit_card: "credit_card",
  passport: "passport",
  visa: "visa",
  diploma: "diploma",
  id_card: "id_card",
  driver_license: "driver_license",
  i20: "i20",
  i797: "i797",
  other: "other",
};

export const DOC_TYPE_ICON_OPTIONS: IconOption[] = [
  { key: "credit_card", label: "Credit Card", icon: ICON_MAP.credit_card },
  { key: "passport", label: "Passport", icon: ICON_MAP.passport },
  { key: "visa", label: "Visa", icon: ICON_MAP.visa },
  { key: "diploma", label: "Diploma", icon: ICON_MAP.diploma },
  { key: "id_card", label: "ID Card", icon: ICON_MAP.id_card },
  { key: "driver_license", label: "Driver License", icon: ICON_MAP.driver_license },
  { key: "i20", label: "I-20", icon: ICON_MAP.i20 },
  { key: "i797", label: "I-797", icon: ICON_MAP.i797 },
  { key: "other", label: "Other", icon: ICON_MAP.other },
  { key: "file_text", label: "File Text", icon: ICON_MAP.file_text },
  { key: "file_search", label: "File Search", icon: ICON_MAP.file_search },
  { key: "folder", label: "Folder", icon: ICON_MAP.folder },
  { key: "safety", label: "Safety", icon: ICON_MAP.safety },
  { key: "bank", label: "Bank", icon: ICON_MAP.bank },
  { key: "wallet", label: "Wallet", icon: ICON_MAP.wallet },
  { key: "home", label: "Home", icon: ICON_MAP.home },
  { key: "medicine", label: "Medicine", icon: ICON_MAP.medicine },
  { key: "calendar", label: "Calendar", icon: ICON_MAP.calendar },
  { key: "profile", label: "Profile", icon: ICON_MAP.profile },
  { key: "book", label: "Book", icon: ICON_MAP.book },
  { key: "global", label: "Global", icon: ICON_MAP.global },
  { key: "car", label: "Car", icon: ICON_MAP.car },
  { key: "idcard", label: "Id Card", icon: ICON_MAP.idcard },
  { key: "trophy", label: "Trophy", icon: ICON_MAP.trophy },
];

export function defaultDocTypeIconKey(docType: string): DocTypeIconKey {
  return DEFAULT_ICON_BY_TYPE[docType] || "other";
}

export function getDocTypeIcon(iconKey?: string | null, docType?: string): ReactNode {
  if (iconKey && (iconKey as DocTypeIconKey) in ICON_MAP) {
    return ICON_MAP[iconKey as DocTypeIconKey];
  }
  const fallbackKey = defaultDocTypeIconKey((docType || "").toLowerCase());
  return ICON_MAP[fallbackKey] || ICON_MAP.other;
}
