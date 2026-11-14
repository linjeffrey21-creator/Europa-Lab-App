import { ARBOR_MINI_ID, BOREAL_ID, EISCO_PH0343_ID, PASCO_ME6800_ID, PASCO_MINI_ID, VERNIER_VPL_ID } from '../equipment/schema.ts';
import { loadEiscoLauncher } from './eiscoAsset.ts';
import { loadBorealLauncher } from './borealAsset.ts';
import { loadArborLauncher } from './arborLauncher.ts';
import { loadPascoLauncher } from './pascoLauncher.ts';
import { loadPascoMiniLauncher } from './pascoMiniAsset.ts';
import { loadVernierLauncher } from './vernierAsset.ts';

export const launcherAssetLoaders: Partial<Record<string, () => Promise<void>>> = {
  [ARBOR_MINI_ID]: loadArborLauncher,
  [BOREAL_ID]: loadBorealLauncher,
  [EISCO_PH0343_ID]: loadEiscoLauncher,
  [PASCO_ME6800_ID]: loadPascoLauncher,
  [PASCO_MINI_ID]: loadPascoMiniLauncher,
  [VERNIER_VPL_ID]: loadVernierLauncher,
};
