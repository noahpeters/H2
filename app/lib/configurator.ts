export const CONFIGURATOR_OPTIONS = {
  timber: ['White oak', 'Walnut', 'Maple'],
  length: ['60 in', '72 in', '84 in', '96 in'],
  edge: ['Natural', 'Straight', 'Soft roundover'],
  base: ['Trestle', 'Four leg', 'Pedestal'],
  width: ['34 in', '36 in', '40 in', '42 in'],
  chairs: ['4', '6', '8', '10'],
} as const;

export type Configuration = {
  timber: string;
  length: string;
  edge: string;
  base: string;
  shape: 'Rectangle';
  width: string;
  chairs: string;
};

export const DEFAULT_CONFIGURATION: Configuration = {
  timber: CONFIGURATOR_OPTIONS.timber[0],
  length: CONFIGURATOR_OPTIONS.length[1],
  edge: CONFIGURATOR_OPTIONS.edge[0],
  base: CONFIGURATOR_OPTIONS.base[0],
  shape: 'Rectangle',
  width: CONFIGURATOR_OPTIONS.width[1],
  chairs: CONFIGURATOR_OPTIONS.chairs[1],
};

export function configurationSummary(configuration: Configuration) {
  return [
    'Table inquiry',
    `Timber: ${configuration.timber}`,
    `Length: ${configuration.length}`,
    `Edge: ${configuration.edge}`,
    `Base: ${configuration.base}`,
    `Shape: ${configuration.shape}`,
    `Width: ${configuration.width}`,
    `Seating: ${configuration.chairs} chairs`,
  ].join('\n');
}
