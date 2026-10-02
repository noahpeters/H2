import type {ConstructionProfile} from './profile';
export type Vec3 = [number, number, number];
export type Pocket = {
  origin: Vec3;
  size: Vec3;
  operation: 'dado' | 'rabbet' | 'groove';
};
export type FabricationPart = {
  id: string;
  assemblyId: string;
  name: string;
  origin: Vec3;
  size: Vec3;
  grainAxis: 0 | 1 | 2;
  material: string;
  stockType: 'sheet' | 'solid' | 'hardware';
  pockets: Pocket[];
  mesh?: {vertices: Vec3[]; faces: number[][]};
  basis?: [Vec3, Vec3, Vec3];
};
export type FabricationAssembly = {
  id: string;
  name: string;
  origin: Vec3;
  rotation: number;
};
export type FabricationManifest = {
  schema: 'from-trees-fabrication';
  version: 2;
  units: 'in';
  design: {slug: string; revision: number; updatedAt: string};
  profile: ConstructionProfile;
  assemblies: FabricationAssembly[];
  parts: FabricationPart[];
  assumptions: string[];
  excluded: string[];
};
export class FabricationError extends Error {
  constructor(public issues: string[]) {
    super(issues.join('\n'));
  }
}
