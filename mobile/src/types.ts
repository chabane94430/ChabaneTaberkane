export type Role = "CLIENT" | "LOCKSMITH";

export type IssueType =
  | "DOOR_LOCKOUT"
  | "CAR_LOCKOUT"
  | "LOCK_CHANGE"
  | "BROKEN_KEY"
  | "SAFE_OPENING"
  | "SECURITY_UPGRADE"
  | "OTHER";

export const ISSUE_LABELS: Record<IssueType, string> = {
  DOOR_LOCKOUT: "Porte claquée / bloquée",
  CAR_LOCKOUT: "Clés bloquées dans la voiture",
  LOCK_CHANGE: "Changer une serrure",
  BROKEN_KEY: "Clé cassée",
  SAFE_OPENING: "Ouverture de coffre-fort",
  SECURITY_UPGRADE: "Renforcer la sécurité",
  OTHER: "Autre",
};

export type RequestStatus = "PENDING" | "ACCEPTED" | "ARRIVED" | "COMPLETED" | "CANCELLED";

export interface LocksmithProfile {
  id: string;
  userId: string;
  isOnline: boolean;
  latitude?: number | null;
  longitude?: number | null;
  ratingAvg: number;
  ratingCount: number;
  bio?: string | null;
  yearsExperience?: number | null;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  locksmithProfile?: LocksmithProfile;
}

export interface ServiceRequest {
  id: string;
  clientId: string;
  locksmithId?: string | null;
  issueType: IssueType;
  description?: string | null;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: RequestStatus;
  priceEstimateMin?: number | null;
  priceEstimateMax?: number | null;
  finalPrice?: number | null;
  createdAt: string;
  distanceKm?: number;
}

export interface LocksmithSummary {
  id: string;
  fullName: string;
  phone?: string | null;
  rating?: number;
  latitude?: number;
  longitude?: number;
}
