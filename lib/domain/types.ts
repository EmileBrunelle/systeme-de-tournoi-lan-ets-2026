// lib/domain/types.ts

/** Identifiant unique d'un participant (équipe ou joueur solo). */
export type ParticipantId = string;

/** Un participant : une équipe Valorant ou un joueur solo. */
export interface Participant {
  id: ParticipantId;
  name: string;
  /** Seed initial (1 = premier slot). Tiré au hasard pour Valorant. */
  seed: number;
}

/** Statut d'un participant dans une phase suisse. */
export type SwissStatus = 'active' | 'qualified' | 'eliminated';

/** Une ligne de classement calculée. */
export interface Standing {
  participantId: ParticipantId;
  name: string;
  /** Position dans le classement (1 = premier). */
  rank: number;
  wins: number;
  losses: number;
  /** Tiebreak (Buchholz : somme des victoires des adversaires). */
  tiebreak: number;
  status: SwissStatus;
}
