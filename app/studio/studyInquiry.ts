import type {Study} from './cabinet-configurator/CabinetConfigurator';

export function tableStudySummary(details: {
  shape: string;
  timber: string;
  dimension: string;
  edge: string;
  base: string;
  chairs: string;
}) {
  return [
    'Configurator source: table',
    'Table study',
    `Shape: ${details.shape}`,
    `Dimensions: ${details.dimension}`,
    `Timber: ${details.timber}`,
    `Edge: ${details.edge}`,
    `Base: ${details.base}`,
    `Chair study: ${details.chairs}`,
  ].join('\n');
}

export function cabinetStudySummary(study: Study) {
  const kinds = new Map<string, number>();
  for (const element of study.elements)
    kinds.set(element.kind, (kinds.get(element.kind) ?? 0) + 1);
  return [
    'Configurator source: cabinet',
    'Cabinet study',
    `Room: ${study.room.width}″ × ${study.room.depth}″ × ${study.room.height}″ high`,
    `Cabinet elements: ${study.elements.length}`,
    ...[...kinds].map(([kind, count]) => `${kind}: ${count}`),
    `Islands: ${study.islands.length}`,
    `Openings: ${study.openings.length}`,
    `Countertop: ${study.countertop ? 'included' : 'not included'}`,
  ].join('\n');
}
