// The maps the server rotates through (it names the current one in every snapshot; the ground itself is bundled here).
import city from '../../shared/map.json';
import forest from '../../shared/forest.json';
import industry from '../../shared/industry.json';

export type MapData = {
  name?: string;
  theme?: string;
  tile: number;
  rows: string[];
  props?: { kind: string; x: number; y: number; w: number; h: number; flip?: boolean; v?: number }[];
  roads?: { v: number[][]; h: number[][] };
  crates?: { x: number; y: number; team: string }[];
  tents?: { x: number; y: number; team: string }[];
  nests?: { x: number; y: number; team: string }[];
  capture: { x: number; y: number; r: number };
  train?: { len: number; tracks: { y: number; h: number; x0: number; x1: number }[] }; // Industry: a train crosses a track now and then
};

export const MAPS: Record<string, MapData> = {
  city: { name: 'The Ruins', theme: 'city', ...(city as unknown as MapData) },
  forest: { ...(forest as unknown as MapData) },
  industry: { ...(industry as unknown as MapData) },
};
export const mapName = (id: string) => MAPS[id]?.name ?? 'The Ruins';
