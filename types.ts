
export interface User {
  id: string;
  email: string;
  name: string;
  isPro: boolean;
  joinedDate: string;
}

export interface PlantIdentification {
  name: string;
  scientificName: string;
  family: string;
  description: string;
  facts: string[];
  careGuide: CareGuide;
  isToxic: boolean;
  toxicityDetails?: string;
  isWeed: boolean;
}

export interface CareGuide {
  watering: string;
  sunlight: string;
  soil: string;
  temperature: string;
  homeRemedies: string[];
}

export interface PlantDiagnosis {
  id: string;
  timestamp: string;
  plantName: string;
  issue: string;
  confidence: number;
  symptoms: string[];
  causes: string[];
  recommendations: string[];
  prognosis: string;
}

export interface JournalEntry {
  id: string;
  timestamp: string;
  plant: PlantIdentification;
  imageUrl: string | null;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface LocalGardenCenter {
  name: string;
  address: string;
  rating: number;
  uri: string;
}
