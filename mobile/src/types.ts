export type Role = "CLIENT" | "LOCKSMITH" | "ADMIN";

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

export type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED";

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
  idDocumentUrl?: string | null;
  verificationStatus: VerificationStatus;
  cancelledJobsCount: number;
  suspended: boolean;
  stripeOnboarded: boolean;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  locksmithProfile?: LocksmithProfile;
}

export interface RequestPhoto {
  id: string;
  requestId: string;
  url: string;
  createdAt: string;
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
  cancellationFee?: number | null;
  createdAt: string;
  distanceKm?: number;
  cancelReason?: "CLIENT_CANCELLED" | "LOCKSMITH_CANCELLED" | "NO_LOCKSMITH_AVAILABLE" | null;
  paymentStatus: PaymentStatus;
  photos?: RequestPhoto[];
}

export interface LocksmithSummary {
  id: string;
  fullName: string;
  phone?: string | null;
  rating?: number;
  latitude?: number;
  longitude?: number;
}

export interface ChatMessage {
  id: string;
  requestId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
